import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import admin from '../config/firebaseAdmin';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { reqStr, SportEnum, RoleEnum, AthleticsEventEnum, GenderEnum } from '../validation/common';
import { HandoverConsentBody, HandoverCompleteBody } from '../validation/auth';
import { generateSecureToken, hashToken } from '../utils/crypto';
import { sendGuardianConsentEmail } from '../services/email';
import { env } from '../config/env';
import logger from '../utils/logger';
import { signMediaDeep } from '../services/storage';

const router = Router();

/** Age below which an athlete account must be managed by a parent/academy. */
const GUARDIAN_AGE_THRESHOLD = 13;
/** Handover consent links stay valid for 7 days. */
const HANDOVER_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Single client origin for building links (CLIENT_URL may be a comma list). */
const clientOrigin = Array.isArray(env.CLIENT_URL) ? env.CLIENT_URL[0] : env.CLIENT_URL;

/** Whole years between a date of birth and now. */
function ageFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ─── Body schema for new-user sync ────────────────────────────────────────────

const SyncBody = z.object({
  name:             reqStr(50, 'Name'),
  role:             RoleEnum,
  sport:            SportEnum,
  gender:           GenderEnum.optional(),
  athleticsEvents:  z.array(AthleticsEventEnum).max(21).optional(),
  age:              z.number().int().min(10).max(100).optional(),
  // ISO date string; age is derived from this server-side when present.
  dateOfBirth:      z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date').optional(),
  location:         z.string().max(200).optional(),
  height:           z.string().max(20).optional(),
});

// ─── POST /api/auth/sync ───────────────────────────────────────────────────────
//
// Called by the client immediately after Firebase `createUserWithEmailAndPassword`.
//
// Behaviour:
//   • Verifies the Firebase ID token (new accounts won't have custom claims yet
//     so we bypass the normal `authenticate` middleware here).
//   • If the Prisma user already exists → refreshes custom claims and returns the
//     existing profile (idempotent — safe to call on every login too).
//   • If the user is new → validates { name, role, sport } from the request body,
//     creates the Prisma user, and sets Firebase custom claims { userId, role }.
//
// After this endpoint returns `refreshClaims: true` the client MUST call
// `firebaseUser.getIdToken(true)` to force-refresh the ID token so that
// subsequent API calls include the custom claims.

router.post('/sync', async (req: Request, res: Response) => {
  // Verify Firebase token manually (custom claims not present yet for new users)
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(authHeader.split(' ')[1]);
  } catch {
    res.status(401).json({ error: 'Invalid Firebase token' });
    return;
  }

  try {
    if (!decoded.email) {
      res.status(400).json({ error: 'Firebase account has no email' });
      return;
    }
    const email = decoded.email.toLowerCase();

    // ── Existing user (matched by Firebase UID) ────────────────────────────────
    const existing = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (existing) {
      // Refresh custom claims in case role changed (e.g. admin promoted the user)
      await admin.auth().setCustomUserClaims(decoded.uid, {
        userId: existing.id,
        role:   existing.role,
      });
      logger.info('auth.sync.existing', { userId: existing.id, role: existing.role });
      await signMediaDeep(existing);
      res.json({ user: existing, refreshClaims: true });
      return;
    }

    // ── Orphan user (same email, different UID — e.g. account recreated) ───────
    // Check this BEFORE body validation so a returning user never sees a 400.
    const orphan = await prisma.user.findUnique({ where: { email } });
    if (orphan) {
      const user = await prisma.user.update({
        where: { email },
        data:  { firebaseUid: decoded.uid },
      });
      await admin.auth().setCustomUserClaims(decoded.uid, { userId: user.id, role: user.role });
      logger.info('auth.sync.claimed_orphan', { userId: user.id });
      res.json({ user, refreshClaims: true });
      return;
    }

    // ── New user — requires full registration body ──────────────────────────────
    const parse = SyncBody.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error:   'Validation failed',
        details: parse.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
      return;
    }
    const { name, role, sport, gender, athleticsEvents, age, dateOfBirth, location, height } = parse.data;

    // Derive age from the date of birth when provided (don't trust the client age).
    const dob = dateOfBirth ? new Date(dateOfBirth) : null;
    const effectiveAge = dob ? ageFromDob(dob) : age;

    // Athletes registering under 13 are managed by a parent/academy: the account
    // email/password (already set on the Firebase account) belong to the guardian.
    const guardianManaged =
      role === 'ATHLETE' && effectiveAge !== undefined && effectiveAge < GUARDIAN_AGE_THRESHOLD;

    const user = await prisma.user.create({
      data: {
        firebaseUid: decoded.uid,
        email,
        name,
        role,
        sport,
        ...(gender && { gender }),
        ...(sport === 'ATHLETICS' && athleticsEvents && athleticsEvents.length > 0 && { athleticsEvents }),
        ...(effectiveAge !== undefined && { age: effectiveAge }),
        ...(dob && { dateOfBirth: dob }),
        ...(location && { location }),
        ...(height   && { height }),
        ...(guardianManaged && { guardianManaged: true, guardianEmail: email }),
      },
    });

    // Set custom claims so the client's next getIdToken(true) includes them
    await admin.auth().setCustomUserClaims(decoded.uid, { userId: user.id, role: user.role });

    logger.info('auth.register', { userId: user.id, role: user.role, sport: user.sport, guardianManaged });
    res.status(201).json({ user, refreshClaims: true });
  } catch (error) {
    logger.error('Sync error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Verification helpers ─────────────────────────────────────────────────────

const meSelect = {
  id: true, email: true, name: true, role: true, sport: true,
  gender: true,
  athleticsEvents: true,
  avatar: true, bio: true, location: true, age: true, height: true,
  position: true, achievements: true, verified: true, phoneVerified: true,
  phone: true, createdAt: true,
  dateOfBirth: true, guardianManaged: true, handoverStatus: true,
  mustResetPassword: true,
};

/** A profile is "complete" when these essential fields are all filled in. */
function isProfileComplete(u: any): boolean {
  return !!(u.name && u.bio && u.avatar && u.location && u.age && u.position && u.sport);
}

/**
 * Recalculate and persist the `verified` flag.
 * Verified = email verified + phone verified + complete profile.
 */
async function recalcVerified(userId: string, emailVerified: boolean) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  const shouldBeVerified = u.role === 'ADMIN' ? true : (emailVerified && u.phoneVerified && isProfileComplete(u));
  if (u.verified !== shouldBeVerified) {
    return prisma.user.update({
      where: { id: userId },
      data: { verified: shouldBeVerified },
      select: meSelect,
    });
  }
  return null;
}

// ─── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    let user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: meSelect,
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    // Recalculate verified status on every /me call
    const updated = await recalcVerified(req.user!.userId, req.user!.emailVerified);
    if (updated) user = updated;

    await signMediaDeep(user);
    res.json({ user });
  } catch (error) {
    logger.error('Me error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/auth/password-changed ─────────────────────────────────────────
//
// Called by the client after a bulk-provisioned user changes their temp password
// (via Firebase) on first login. Clears the `mustResetPassword` flag so the
// forced-reset gate lets them through. Idempotent.

router.post('/password-changed', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data:  { mustResetPassword: false },
      select: { id: true, mustResetPassword: true },
    });
    logger.info('auth.password_changed', { userId: user.id });
    res.json({ mustResetPassword: user.mustResetPassword });
  } catch (error) {
    logger.error('Password changed error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Guardian handover (under-13 athletes) ─────────────────────────────────────
//
// Flow:
//   1. POST /handover/request  (athlete/guardian, authenticated) — emails a
//      consent form to the guardian email. Allowed only once the athlete is 13+.
//   2. POST /handover/consent  (guardian, public + token) — guardian accepts.
//   3. POST /handover/complete (athlete, authenticated) — after consent, the
//      athlete's new email is recorded and the account leaves guardian management.
//      (The Firebase email/password change happens client-side beforehand.)

// ─── POST /api/auth/handover/request ────────────────────────────────────────────

router.post('/handover/request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (!user.guardianManaged) {
      res.status(400).json({ error: 'This account is not under guardian management' });
      return;
    }
    const age = user.dateOfBirth ? ageFromDob(user.dateOfBirth) : user.age ?? 0;
    if (age < GUARDIAN_AGE_THRESHOLD) {
      res.status(403).json({ error: `Handover is available once the athlete turns ${GUARDIAN_AGE_THRESHOLD}` });
      return;
    }

    const rawToken = generateSecureToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        handoverStatus:         'PENDING',
        handoverTokenHash:      hashToken(rawToken),
        handoverTokenExpiresAt: new Date(Date.now() + HANDOVER_TOKEN_TTL_MS),
        handoverRequestedAt:    new Date(),
        handoverConsentAt:      null,
      },
    });

    const consentUrl = `${clientOrigin}/handover/consent?token=${rawToken}`;
    await sendGuardianConsentEmail(user.guardianEmail ?? user.email, {
      athleteName: user.name,
      consentUrl,
    });

    logger.info('auth.handover.requested', { userId: user.id });
    res.json({ status: 'PENDING' });
  } catch (error) {
    logger.error('Handover request error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/auth/handover/consent ─────────────────────────────────────────────
// Public — the guardian clicks the emailed link. Identified solely by the token.

router.post('/handover/consent', validate({ body: HandoverConsentBody }), async (req: Request, res: Response) => {
  try {
    const { token } = req.body as { token: string };
    const user = await prisma.user.findFirst({
      where: { handoverTokenHash: hashToken(token), handoverStatus: 'PENDING' },
    });
    if (!user || !user.handoverTokenExpiresAt || user.handoverTokenExpiresAt < new Date()) {
      res.status(400).json({ error: 'This consent link is invalid or has expired' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        handoverStatus:         'CONSENTED',
        handoverConsentAt:      new Date(),
        handoverTokenHash:      null,
        handoverTokenExpiresAt: null,
      },
    });

    logger.info('auth.handover.consented', { userId: user.id });
    res.json({ status: 'CONSENTED', athleteName: user.name });
  } catch (error) {
    logger.error('Handover consent error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/auth/handover/complete ────────────────────────────────────────────
// Authenticated. Called after the client has changed the Firebase email/password.
// Records the athlete's new email and lifts guardian management.

router.post('/handover/complete', authenticate, validate({ body: HandoverCompleteBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { newEmail } = req.body as { newEmail: string };
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.handoverStatus !== 'CONSENTED') {
      res.status(400).json({ error: 'Guardian consent is required before completing handover' });
      return;
    }

    // Guard against colliding with another account's email.
    const clash = await prisma.user.findUnique({ where: { email: newEmail } });
    if (clash && clash.id !== user.id) {
      res.status(409).json({ error: 'That email is already in use' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email:           newEmail,
        guardianManaged: false,
        handoverStatus:  'NONE',
        // guardianEmail + handoverConsentAt are intentionally retained for audit.
      },
      select: meSelect,
    });

    logger.info('auth.handover.completed', { userId: user.id });
    await signMediaDeep(updated);
    res.json({ user: updated });
  } catch (error) {
    logger.error('Handover complete error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

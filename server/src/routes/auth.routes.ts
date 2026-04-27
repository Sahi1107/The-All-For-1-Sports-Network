import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import admin from '../config/firebaseAdmin';
import { authenticate, AuthRequest } from '../middleware/auth';
import { reqStr, SportEnum, RoleEnum, AthleticsEventEnum } from '../validation/common';
import logger from '../utils/logger';
import { signMediaDeep } from '../services/storage';

const router = Router();

// ─── Body schema for new-user sync ────────────────────────────────────────────

const SyncBody = z.object({
  name:             reqStr(50, 'Name'),
  role:             RoleEnum,
  sport:            SportEnum,
  athleticsEvents:  z.array(AthleticsEventEnum).max(21).optional(),
  age:              z.number().int().min(10).max(100).optional(),
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
    const { name, role, sport, athleticsEvents, age, location, height } = parse.data;

    const user = await prisma.user.create({
      data: {
        firebaseUid: decoded.uid,
        email,
        name,
        role,
        sport,
        ...(sport === 'ATHLETICS' && athleticsEvents && athleticsEvents.length > 0 && { athleticsEvents }),
        ...(age      !== undefined && { age }),
        ...(location && { location }),
        ...(height   && { height }),
      },
    });

    // Set custom claims so the client's next getIdToken(true) includes them
    await admin.auth().setCustomUserClaims(decoded.uid, { userId: user.id, role: user.role });

    logger.info('auth.register', { userId: user.id, role: user.role, sport: user.sport });
    res.status(201).json({ user, refreshClaims: true });
  } catch (error) {
    logger.error('Sync error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Verification helpers ─────────────────────────────────────────────────────

const meSelect = {
  id: true, email: true, name: true, role: true, sport: true,
  athleticsEvents: true,
  avatar: true, bio: true, location: true, age: true, height: true,
  position: true, achievements: true, verified: true, phoneVerified: true,
  phone: true, createdAt: true,
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

export default router;

import crypto from 'crypto';
import { Role, Gender, Sport } from '@prisma/client';
import { generateSecureToken, hashToken } from '../utils/crypto';

// NOTE: prisma / firebaseAdmin / email / env / logger are imported LAZILY inside
// provisionAthleteAccount (via dynamic import) so importing this module for its
// pure helpers (validateProvisionInput, ageFromDob, generateTempPassword) — e.g.
// in unit tests or from bulkProvision's pure validation — has no side effects.

/**
 * The ONE enforced path for creating an athlete/coach account from an admin
 * surface (single form or bulk import). Every rule the self-serve signup follows
 * is enforced here so no admin flow can bypass it:
 *
 *   • DOB is REQUIRED for athletes — age is derived server-side, never trusted.
 *   • Under-13 ⇒ guardianManaged + private-by-default (discoverable=false) and a
 *     guardian email is REQUIRED.
 *   • Under-13 ⇒ NO login credentials are issued until the guardian consents via
 *     an emailed link (status PENDING); on consent the guardian gets the welcome
 *     email with the temp password.
 *   • 13+/adults ⇒ the athlete gets the welcome email with the temp password now.
 *
 * Accounts are "claimable": a Firebase user + temp password + mustResetPassword,
 * so the recipient logs in and takes over. Idempotent — an existing account
 * (by email) is linked, not recreated or modified.
 */

/** Age below which an athlete account must be guardian-managed. Canonical home. */
export const GUARDIAN_AGE_THRESHOLD = 13;

/** Guardian consent links stay valid for 7 days. */
const CONSENT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Whole years between `dob` and today, computed in UTC to match stored dates. */
export function ageFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Temp password meeting the app's complexity policy (upper+lower+digit+symbol, 16 chars). */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const symbol = '!@#$%&*?';
  const all = upper + lower + digit + symbol;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  // Guarantee one of each class, then fill to length 16.
  const chars = [pick(upper), pick(lower), pick(digit), pick(symbol)];
  while (chars.length < 16) chars.push(pick(all));
  // Fisher–Yates shuffle so the guaranteed chars aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Thrown for validation failures the caller should surface as a 400/row error. */
export class ProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProvisionError';
  }
}

export interface ProvisionAthleteInput {
  name: string;
  /** Account login email (the athlete's own; for under-13 the guardian is emailed separately). */
  email: string;
  role: Role;                 // ATHLETE or COACH
  sport: Sport;
  dateOfBirth: Date | null;
  gender?: Gender | null;
  position?: string | null;
  phone?: string | null;
  guardianEmail?: string | null;
}

export interface ProvisionAthleteResult {
  userId: string;
  /** false when an existing account (by email) was linked rather than created. */
  created: boolean;
  /** true when the account is under-13 and awaiting guardian consent (no creds issued yet). */
  guardianConsentPending: boolean;
}

/**
 * Pure validation — runs before any side effect so callers (and bulk preview)
 * can enforce the same rules up front. Returns the derived age and under-13 flag.
 * Throws ProvisionError on any violation.
 */
export function validateProvisionInput(input: ProvisionAthleteInput): { age: number | null; under13: boolean } {
  if (!input.name?.trim()) throw new ProvisionError('Name is required');
  if (!input.email?.trim()) throw new ProvisionError('Email is required');

  const isAthlete = input.role === Role.ATHLETE;
  if (isAthlete && !input.dateOfBirth) {
    throw new ProvisionError('Date of birth is required for athletes');
  }

  const age = input.dateOfBirth ? ageFromDob(input.dateOfBirth) : null;
  const under13 = isAthlete && age !== null && age < GUARDIAN_AGE_THRESHOLD;

  if (under13 && !input.guardianEmail?.trim()) {
    throw new ProvisionError('A guardian email is required for athletes under 13');
  }
  return { age, under13 };
}

export async function provisionAthleteAccount(input: ProvisionAthleteInput): Promise<ProvisionAthleteResult> {
  const { age, under13 } = validateProvisionInput(input);

  const { default: prisma } = await import('../config/db');
  const { default: admin } = await import('../config/firebaseAdmin');
  const { default: logger } = await import('../utils/logger');
  const { sendAthleteWelcome, sendGuardianConsentInvite } = await import('./email');

  const email = input.email.trim().toLowerCase();

  // Idempotent: link an existing account by email; never recreate or modify it.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { userId: existing.id, created: false, guardianConsentPending: false };
  }

  // Create the Firebase auth user (reuse one that already exists for this email).
  // For under-13 the password is a throwaway (never delivered); a fresh temp is
  // set and emailed to the guardian only on consent.
  const initialPassword = generateTempPassword();
  let firebaseUid: string;
  try {
    const fbUser = await admin.auth().createUser({
      email,
      password: initialPassword,
      displayName: input.name,
      emailVerified: false,
    });
    firebaseUid = fbUser.uid;
  } catch (err: any) {
    if (err?.code === 'auth/email-already-exists') {
      firebaseUid = (await admin.auth().getUserByEmail(email)).uid;
    } else {
      throw err;
    }
  }

  const rawConsentToken = under13 ? generateSecureToken() : null;

  const created = await prisma.user.create({
    data: {
      firebaseUid,
      email,
      name: input.name.trim(),
      role: input.role,
      sport: input.sport,
      mustResetPassword: true,
      ...(input.gender && { gender: input.gender }),
      ...(input.dateOfBirth && { dateOfBirth: input.dateOfBirth, age: age ?? undefined }),
      ...(input.position && { position: input.position }),
      ...(input.phone && { phone: input.phone }),
      ...(under13 && {
        guardianManaged: true,
        guardianEmail: input.guardianEmail!.trim().toLowerCase(),
        discoverable: false,
        guardianConsentStatus: 'PENDING',
        guardianConsentTokenHash: hashToken(rawConsentToken!),
        guardianConsentTokenExpiresAt: new Date(Date.now() + CONSENT_TOKEN_TTL_MS),
      }),
    },
    select: { id: true },
  });

  await admin.auth().setCustomUserClaims(firebaseUid, { userId: created.id, role: input.role });

  if (under13) {
    // No credentials yet — the guardian must consent first.
    const { env } = await import('../config/env');
    const clientOrigin = Array.isArray(env.CLIENT_URL) ? env.CLIENT_URL[0] : env.CLIENT_URL;
    const consentUrl = `${clientOrigin}/guardian-consent?token=${rawConsentToken}`;
    try {
      await sendGuardianConsentInvite({ to: input.guardianEmail!.trim(), athleteName: input.name.trim(), consentUrl });
    } catch (err) {
      logger.warn('provisionAthlete.consent_email_failed', { email, error: String(err) });
    }
    logger.info('provisionAthlete.created_under13_pending_consent', { userId: created.id });
    return { userId: created.id, created: true, guardianConsentPending: true };
  }

  // 13+/adult: issue credentials now, welcome the athlete directly.
  try {
    await sendAthleteWelcome({
      to: email,
      athleteName: input.name.trim(),
      loginEmail: email,
      tempPassword: initialPassword,
      forGuardian: false,
    });
  } catch (err) {
    logger.warn('provisionAthlete.welcome_email_failed', { email, error: String(err) });
  }
  logger.info('provisionAthlete.created', { userId: created.id, role: input.role });
  return { userId: created.id, created: true, guardianConsentPending: false };
}

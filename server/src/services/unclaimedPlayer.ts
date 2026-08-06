import crypto from 'crypto';
import { Role, Gender, Sport, ClaimStatus } from '@prisma/client';
import { hashToken } from '../utils/crypto';
import { GUARDIAN_AGE_THRESHOLD, ageFromDob, ProvisionError } from './provisionAthlete';

// ─────────────────────────────────────────────────────────────────────────────
// UNCLAIMED PLAYERS
//
// Most players at a grassroots tournament are not on the platform and often have
// no email at all. An organiser must still be able to put them on a roster, score
// them in the tracker, and have them rank — otherwise the whole event has holes.
//
// So an unclaimed player is a REAL `User` row with:
//   • email = NULL       → nothing to send to; no email notifications ever
//   • firebaseUid = NULL → no identity provider account, so NOBODY can sign in as
//                          it. This is the security property the whole design
//                          rests on: auth only ever resolves a row via a verified
//                          Firebase token's `userId` claim (middleware/auth.ts),
//                          and no token can carry a claim for a row that has no
//                          Firebase user behind it.
//   • claimStatus = UNCLAIMED
//
// Because it is an ordinary User row, TeamMember, BasketballStats/FootballStats/
// CricketStats and PlayerRanking all reference it by `userId` with zero changes —
// rosters, the live tracker, published box scores and the ranking boards work on
// these profiles exactly as they do for registered players.
//
// Later the real player redeems a claim code (handed to them by the organiser)
// and their own login is bound onto this same row, so every stat and ranking
// already recorded stays attached to them. See `claimProfile`.
// ─────────────────────────────────────────────────────────────────────────────

/** Unambiguous alphabet — no O/0, I/1/L, so a code read off a phone screen or
 *  scrawled on a team sheet can't be mistyped into a different valid code. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_GROUP = 4;
const CODE_GROUPS = 2;

/** A fresh claim code, e.g. "K7QP-3M2X". 31^8 ≈ 8.5e11 — with the redemption rate
 *  limit on the route, guessing one is not a practical attack. */
export function generateClaimCode(): string {
  const pick = () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return Array.from({ length: CODE_GROUPS }, () =>
    Array.from({ length: CODE_GROUP }, pick).join(''),
  ).join('-');
}

/** Canonical form for lookup: case- and separator-insensitive, so "k7qp 3m2x",
 *  "K7QP-3M2X" and "k7qp3m2x" all resolve to the same stored hash. */
export function normalizeClaimCode(raw: string): string {
  const stripped = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (stripped.length !== CODE_GROUP * CODE_GROUPS) return '';
  return `${stripped.slice(0, CODE_GROUP)}-${stripped.slice(CODE_GROUP)}`;
}

/** Codes are stored hashed, never in plaintext — the same treatment as the
 *  handover and guardian-consent tokens. Shown to the organiser once per rotation. */
export function claimCodeHash(code: string): string {
  return hashToken(normalizeClaimCode(code));
}

export interface CreateUnclaimedPlayerInput {
  name: string;
  role: Role;                     // ATHLETE or COACH
  sport: Sport;
  gender: Gender;                 // required — the ranking boards are split by gender
  dateOfBirth: Date | null;
  position?: string | null;
  phone?: string | null;
  /** Organiser creating the shell — kept for audit and for re-issuing the code. */
  createdByOrganizerId: string;
  /** Set true to proceed past the name/phone duplicate warning (deliberate create). */
  allowDuplicate?: boolean;
}

export interface CreateUnclaimedPlayerResult {
  userId: string;
  /** Plaintext code — returned ONCE, at creation. Only the hash is stored. */
  claimCode: string;
  /** True when the shell is under 13, so it is kept out of public surfaces. */
  guardianManaged: boolean;
}

/**
 * Pure validation, mirroring validateProvisionInput minus the email rules so the
 * two creation paths can't drift on what a rosterable person must have.
 */
export function validateUnclaimedInput(input: CreateUnclaimedPlayerInput): {
  age: number | null;
  under13: boolean;
} {
  if (!input.name?.trim()) throw new ProvisionError('Name is required');
  if (!input.gender) throw new ProvisionError('Gender is required — ranking boards are split by gender');

  const isAthlete = input.role === Role.ATHLETE;
  if (input.dateOfBirth && Number.isNaN(input.dateOfBirth.getTime())) {
    throw new ProvisionError('Invalid date of birth');
  }

  const age = input.dateOfBirth ? ageFromDob(input.dateOfBirth) : null;
  const under13 = isAthlete && age !== null && age < GUARDIAN_AGE_THRESHOLD;

  // NEITHER a date of birth NOR a guardian email is required here, unlike
  // provisionAthleteAccount. Both of those exist to gate ISSUING CREDENTIALS to a
  // minor, and a shell has none to issue — no login, no password, no email. An
  // organiser copying names off a team sheet has a name and not much else, and
  // blocking the roster on a birthday nobody knows just pushes them back to
  // pen and paper, where the stats reach no profile at all.
  //
  // What still holds the minor-safety line:
  //   • every shell is discoverable = false, so it never reaches people-search,
  //     Radar or Scout Copilot regardless of age;
  //   • a KNOWN under-13 additionally gets guardianManaged, which also keeps it
  //     off the public ranking boards (see services/profileVisibility);
  //   • guardian consent is enforced at CLAIM time (claimProfile), which is the
  //     moment real access to the account actually appears.
  //
  // The residual gap is honest and worth stating: with no DOB we cannot KNOW a
  // player is under 13, so an unknown-age shell is treated as an adult's and can
  // rank publicly. An organiser rostering minors should set the date of birth (or
  // the tournament's age category), which is why the field is still offered.
  return { age, under13 };
}

/**
 * Create the shell profile. Returns the plaintext claim code exactly once — it is
 * stored only as a hash, so a lost code is re-issued (rotated), never recovered.
 */
export async function createUnclaimedPlayer(
  input: CreateUnclaimedPlayerInput,
): Promise<CreateUnclaimedPlayerResult> {
  const { age, under13 } = validateUnclaimedInput(input);

  const { default: prisma } = await import('../config/db');
  const { default: logger } = await import('../utils/logger');

  // Warn on a likely duplicate (same name or phone) so an organiser doesn't create
  // a second shell for a player who already has a profile — which would split
  // their stats across two rows. Never hard-blocks: real squads have same names.
  if (!input.allowDuplicate) {
    const { duplicateWhere } = await import('./duplicateCheck');
    const where = duplicateWhere({ name: input.name, phone: input.phone });
    if (where) {
      const matches = await prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, role: true, sport: true, claimStatus: true },
        take: 5,
      });
      if (matches.length > 0) {
        throw new ProvisionError('A player with matching details already exists.', 'DUPLICATE_WARNING', { matches });
      }
    }
  }

  const code = generateClaimCode();

  const created = await prisma.user.create({
    data: {
      email: null,        // ← the point: no email, and therefore
      firebaseUid: null,  // ← no identity account, so no way to sign in as this row
      name: input.name.trim(),
      role: input.role,
      sport: input.sport,
      gender: input.gender,
      claimStatus: ClaimStatus.UNCLAIMED,
      claimCodeHash: hashToken(code),
      createdByOrganizerId: input.createdByOrganizerId,
      // Kept out of people-search / Radar / Scout until a real person owns it:
      // this profile belongs to someone who has not signed up or consented. The
      // ranking boards carve out an explicit exception (see routes/ranking.routes).
      discoverable: false,
      ...(input.dateOfBirth && { dateOfBirth: input.dateOfBirth, age: age ?? undefined }),
      ...(input.position && { position: input.position }),
      ...(input.phone && { phone: input.phone }),
      ...(under13 && { guardianManaged: true }),
    },
    select: { id: true },
  });

  logger.info('unclaimedPlayer.created', {
    userId: created.id, role: input.role, sport: input.sport, under13,
    createdBy: input.createdByOrganizerId,
  }); // never log the code
  return { userId: created.id, claimCode: code, guardianManaged: under13 };
}

/**
 * Rotate the claim code for a shell profile (the organiser lost the slip, or it
 * was shared with the wrong person). Rotating INVALIDATES the previous code.
 */
export async function reissueClaimCode(userId: string): Promise<string> {
  const { default: prisma } = await import('../config/db');
  const { default: logger } = await import('../utils/logger');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, claimStatus: true },
  });
  if (!user) throw new ProvisionError('Player not found', 'NOT_FOUND');
  if (user.claimStatus !== ClaimStatus.UNCLAIMED) {
    throw new ProvisionError('This profile has already been claimed', 'ALREADY_CLAIMED');
  }

  const code = generateClaimCode();
  await prisma.user.update({ where: { id: userId }, data: { claimCodeHash: hashToken(code) } });
  logger.info('unclaimedPlayer.code_reissued', { userId });
  return code;
}

export interface ClaimPreview {
  userId: string;
  name: string;
  position: string | null;
  avatar: string | null;
  sport: Sport | null;
  /** Tournaments the shell has appeared in — how the claimant recognises it as theirs. */
  teams: { teamName: string; tournamentName: string }[];
  guardianManaged: boolean;
}

/**
 * Look up a shell by claim code WITHOUT redeeming it, so the claimant can confirm
 * "yes, that's me" before binding. Deliberately returns no contact details —
 * a guessed code must not become a PII oracle.
 */
export async function previewClaim(rawCode: string): Promise<ClaimPreview | null> {
  const code = normalizeClaimCode(rawCode);
  if (!code) return null;

  const { default: prisma } = await import('../config/db');
  const user = await prisma.user.findFirst({
    where: { claimCodeHash: hashToken(code), claimStatus: ClaimStatus.UNCLAIMED },
    select: {
      id: true, name: true, position: true, avatar: true, sport: true, guardianManaged: true,
      teamMemberships: {
        where: { status: 'ACCEPTED' },
        select: { team: { select: { name: true, tournament: { select: { name: true } } } } },
        take: 5,
      },
    },
  });
  if (!user) return null;

  return {
    userId: user.id,
    name: user.name,
    position: user.position,
    avatar: user.avatar,
    sport: user.sport,
    guardianManaged: user.guardianManaged,
    teams: user.teamMemberships.map((m) => ({
      teamName: m.team.name,
      tournamentName: m.team.tournament?.name ?? '—',
    })),
  };
}

export interface ClaimProfileInput {
  rawCode: string;
  /** Firebase UID of the person redeeming — they have just authenticated. */
  firebaseUid: string;
  /** Verified email on their Firebase token. Becomes the profile's email. */
  email: string;
  /** True when the identity provider says that address is verified. */
  emailVerified: boolean;
}

export interface ClaimProfileResult {
  userId: string;
  name: string;
  /** Set when a freshly-created empty account was folded into the shell. */
  mergedFromUserId: string | null;
}

/**
 * Redeem a claim code: bind the redeemer's Firebase identity onto the shell row,
 * so everything already recorded against it — roster spots, tracker box scores,
 * published stats, ranking positions — is now theirs.
 *
 * The awkward case is a claimant who ALREADY has a row, because /auth/sync
 * created one the moment they signed in. Two rows cannot be merged safely in
 * general (posts, connections, messages, stats and rankings would all have to be
 * re-pointed, with unique constraints to reconcile), so this handles only the
 * case that actually occurs in practice and refuses the rest:
 *
 *   • no existing row            → bind directly (claim during onboarding)
 *   • existing row, NO history   → they just signed up; delete that empty row and
 *                                  bind the shell to their identity
 *   • existing row WITH history  → refuse with ACCOUNT_HAS_HISTORY. Merging a real
 *                                  account is a support operation, not something
 *                                  to attempt silently behind a code redemption.
 */
export async function claimProfile(input: ClaimProfileInput): Promise<ClaimProfileResult> {
  const code = normalizeClaimCode(input.rawCode);
  if (!code) throw new ProvisionError('That claim code is not valid', 'INVALID_CODE');

  const { default: prisma } = await import('../config/db');
  const { default: admin } = await import('../config/firebaseAdmin');
  const { default: logger } = await import('../utils/logger');

  const shell = await prisma.user.findFirst({
    where: { claimCodeHash: hashToken(code), claimStatus: ClaimStatus.UNCLAIMED },
    select: { id: true, name: true, role: true, dateOfBirth: true, age: true, guardianManaged: true },
  });
  // Same message for "no such code" and "already claimed" — don't confirm which.
  if (!shell) throw new ProvisionError('That claim code is not valid or has already been used', 'INVALID_CODE');

  const email = input.email.trim().toLowerCase();

  // The address must be verified before it becomes the login identity of a
  // profile carrying someone else's competitive record.
  if (!input.emailVerified) {
    throw new ProvisionError('Verify your email address before claiming a profile', 'EMAIL_NOT_VERIFIED');
  }

  // Is that email already the identity of a DIFFERENT account?
  const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const byUid = await prisma.user.findUnique({ where: { firebaseUid: input.firebaseUid }, select: { id: true } });
  const existingId = byUid?.id ?? byEmail?.id ?? null;

  if (byEmail && byUid && byEmail.id !== byUid.id) {
    throw new ProvisionError(
      'Your sign-in is linked to more than one profile. Please contact support.',
      'ACCOUNT_CONFLICT',
    );
  }

  let mergedFromUserId: string | null = null;

  if (existingId && existingId !== shell.id) {
    // Only an account with nothing on it can be folded away. Anything with real
    // history is a genuine profile — refuse rather than destroy or half-merge it.
    const [stats, memberships, posts, rankings] = await Promise.all([
      Promise.all([
        prisma.basketballStats.count({ where: { userId: existingId } }),
        prisma.footballStats.count({ where: { userId: existingId } }),
        prisma.cricketStats.count({ where: { userId: existingId } }),
      ]).then((c) => c.reduce((a, b) => a + b, 0)),
      prisma.teamMember.count({ where: { userId: existingId } }),
      prisma.post.count({ where: { userId: existingId } }),
      prisma.playerRanking.count({ where: { userId: existingId } }),
    ]);
    if (stats + memberships + posts + rankings > 0) {
      throw new ProvisionError(
        'Your account already has activity on it, so it can\'t be merged automatically. Please contact support to link this profile.',
        'ACCOUNT_HAS_HISTORY',
      );
    }
    mergedFromUserId = existingId;
  }

  // Under-13 shells stay guardian-managed and private on claim: whoever holds the
  // email operating a minor's account is treated as the guardian, exactly as
  // /auth/sync does for an under-13 self-registration.
  const age = shell.dateOfBirth ? ageFromDob(shell.dateOfBirth) : shell.age ?? null;
  const under13 = shell.role === Role.ATHLETE && age !== null && age < GUARDIAN_AGE_THRESHOLD;

  const claimed = await prisma.$transaction(async (tx) => {
    // Free the email + UID from the empty shell-of-a-signup before reusing them,
    // or the unique constraints below reject the update.
    if (mergedFromUserId) {
      await tx.user.delete({ where: { id: mergedFromUserId } });
    }

    // updateMany, not update, so `claimStatus: UNCLAIMED` is part of the WHERE and
    // the check-then-write is a SINGLE guarded statement. With a plain update, two
    // requests redeeming the same code could both pass the findFirst above and
    // both write — the second silently stealing a profile the first just claimed.
    // Here the second matches zero rows and is rejected as a spent code.
    const { count } = await tx.user.updateMany({
      where: { id: shell.id, claimStatus: ClaimStatus.UNCLAIMED },
      data: {
        firebaseUid: input.firebaseUid,
        email,
        claimStatus: ClaimStatus.CLAIMED,
        claimedAt: new Date(),
        claimCodeHash: null, // spent — the code cannot be replayed
        // The claimant now owns the profile, so it becomes a normal, findable one
        // — unless it is a minor's, which stays private under guardian control.
        discoverable: !under13,
        ...(under13
          ? { guardianManaged: true, guardianEmail: email }
          : { guardianManaged: false }),
      },
    });
    if (count === 0) {
      throw new ProvisionError('That claim code is not valid or has already been used', 'INVALID_CODE');
    }

    return tx.user.findUniqueOrThrow({
      where: { id: shell.id },
      select: { id: true, name: true, role: true },
    });
  });

  // Point the identity provider at the row they now own, so their very next
  // request authenticates as the claimed profile rather than the deleted one.
  await admin.auth().setCustomUserClaims(input.firebaseUid, {
    userId: claimed.id,
    role: claimed.role,
  });

  logger.info('unclaimedPlayer.claimed', {
    userId: claimed.id, mergedFromUserId, under13,
  });
  return { userId: claimed.id, name: claimed.name, mergedFromUserId };
}

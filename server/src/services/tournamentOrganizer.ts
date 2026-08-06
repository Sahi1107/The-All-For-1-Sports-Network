// Tournament-organiser assignment + provisioning. Assignment (TournamentOrganizer
// rows) is what grants scoped access; middleware/tournamentAccess.ts enforces it.
// These functions are only ever called from super-admin-gated endpoints.
import { Role, OrganizerAuditAction } from '@prisma/client';
import prisma from '../config/db';
import { generateTempPassword } from './provisionAthlete';
import { sendOrganizerWelcome } from './email';
import { notify } from './notifications/notify';
import logger from '../utils/logger';

function clientOrigin(): string {
  return (process.env.CLIENT_URL || 'https://allfor1.pro').split(',')[0];
}
export function managePath(tournamentId: string): string {
  return `/tournaments/${tournamentId}/manage`;
}
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Pure: decide how an "add organiser" request is fulfilled, WITHOUT ever putting a
 * role into the plan for an existing account. An existing user — identified by id,
 * or by an email that matched an account — is only ASSIGNED (a TournamentOrganizer
 * row via assignOrganizer, which never touches user.role). A role is set solely
 * when we CREATE a brand-new account (create-new → provisionOrganizerAccount).
 *
 * This is the invariant behind "assigning someone to a tournament must not downgrade
 * their platform role": there is no branch in which an existing ADMIN's role is
 * written, because `assign-existing` carries only a target id — never a role.
 */
export type OrganizerAddPlan =
  | { action: 'assign-existing'; targetUserId: string }
  | { action: 'create-new' };

export function planOrganizerAdd(input: { userId?: string | null; existingUserIdByEmail?: string | null }): OrganizerAddPlan {
  if (input.userId) return { action: 'assign-existing', targetUserId: input.userId };
  if (input.existingUserIdByEmail) return { action: 'assign-existing', targetUserId: input.existingUserIdByEmail };
  return { action: 'create-new' };
}

/** Existing-account lookup — powers the add-organiser case detection (assign vs create). */
export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, name: true, email: true, avatar: true, role: true },
  });
}

/** Create a NEW organiser account (Firebase + Prisma, role ORGANIZER, forced
 *  password reset) and send the branded temp-password welcome. Password never logged. */
export async function provisionOrganizerAccount(input: {
  name: string; email: string; tournamentId: string; tournamentName: string;
}): Promise<{ userId: string }> {
  const { default: admin } = await import('../config/firebaseAdmin');
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const tempPassword = generateTempPassword();

  let firebaseUid: string;
  try {
    const fb = await admin.auth().createUser({ email, password: tempPassword, displayName: name, emailVerified: true });
    firebaseUid = fb.uid;
  } catch (err) {
    if ((err as { code?: string })?.code === 'auth/email-already-exists') {
      firebaseUid = (await admin.auth().getUserByEmail(email)).uid;
    } else {
      throw err;
    }
  }

  const user = await prisma.user.create({
    data: { firebaseUid, email, name, role: Role.ORGANIZER, mustResetPassword: true, verified: true },
    select: { id: true, email: true, name: true },
  });
  await admin.auth().setCustomUserClaims(firebaseUid, { userId: user.id, role: Role.ORGANIZER });

  await sendOrganizerWelcome(
    { email, name: user.name }, // the address we just created the account with
    tempPassword,
    input.tournamentName,
    `${clientOrigin()}${managePath(input.tournamentId)}`,
  ).catch((e) => logger.error('organizer.welcome_email_failed', { userId: user.id, e: String(e) }));

  logger.info('organizer.account_provisioned', { userId: user.id, tournamentId: input.tournamentId }); // no password
  return { userId: user.id };
}

/** A durable, human-readable snapshot so an audit row stays legible even if the
 *  tournament or user is later deleted. */
async function auditDetail(tournamentId: string, userId: string): Promise<string> {
  const [u, t] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } }),
  ]);
  return `${u?.name ?? 'Unknown user'} (${u?.email ?? '—'}) · ${t?.name ?? 'Unknown tournament'}`;
}

/**
 * Grant organiser access (idempotent — re-adding is a no-op, never a duplicate).
 * On a genuinely NEW grant the assignment and its audit row are written in one
 * transaction, so access is never granted without a recorded reason and actor.
 */
export async function assignOrganizer(
  tournamentId: string, userId: string, addedById: string,
  opts: { accountCreated?: boolean } = {},
) {
  const existing = await prisma.tournamentOrganizer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { id: true },
  });
  if (existing) {
    // Already an organiser — nothing changes, so nothing to audit.
    return prisma.tournamentOrganizer.findUniqueOrThrow({ where: { tournamentId_userId: { tournamentId, userId } } });
  }

  const detail = await auditDetail(tournamentId, userId);
  const [row] = await prisma.$transaction([
    prisma.tournamentOrganizer.create({ data: { tournamentId, userId, addedById } }),
    prisma.organizerAudit.create({
      data: {
        tournamentId, userId, actorId: addedById,
        action: OrganizerAuditAction.GRANTED,
        accountCreated: opts.accountCreated ?? false,
        detail,
      },
    }),
  ]);
  return row;
}

/** Notify an EXISTING user they've been made an organiser (in-app + email per prefs). */
export async function notifyOrganizerAssigned(userId: string, tournamentId: string, tournamentName: string): Promise<void> {
  const message = `You’ve been made an organiser for ${tournamentName}. You can manage teams, the draw, scheduling and results from the tournament’s manage page.`;
  await notify({
    recipientId: userId,
    type: 'SYSTEM',
    title: 'You’re now a tournament organiser',
    message,
    // SYSTEM email copy renders from ctx.extra (catalog); mirror the in-app message.
    ctx: { extra: message },
    link: managePath(tournamentId),
  }).catch((e) => logger.warn('organizer.notify_failed', { userId, e: String(e) }));
}

/**
 * Revoke — access is checked live per request, so this takes effect immediately.
 * The delete and its audit row are written in one transaction. Revoking someone
 * who isn't an organiser is a no-op (nothing to record).
 */
export async function revokeOrganizer(tournamentId: string, userId: string, actorId: string | null): Promise<void> {
  const existing = await prisma.tournamentOrganizer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { id: true },
  });
  if (!existing) return;

  const detail = await auditDetail(tournamentId, userId);
  await prisma.$transaction([
    prisma.tournamentOrganizer.delete({ where: { tournamentId_userId: { tournamentId, userId } } }),
    prisma.organizerAudit.create({
      data: { tournamentId, userId, actorId, action: OrganizerAuditAction.REVOKED, detail },
    }),
  ]);
}

export async function listOrganizers(tournamentId: string) {
  return prisma.tournamentOrganizer.findMany({
    where: { tournamentId },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
      addedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** The access-history audit trail for a tournament (most recent first). */
export async function listOrganizerAudit(tournamentId: string) {
  return prisma.organizerAudit.findMany({
    where: { tournamentId },
    include: {
      user:  { select: { id: true, name: true, email: true } },
      actor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

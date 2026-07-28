// Tournament-organiser assignment + provisioning. Assignment (TournamentOrganizer
// rows) is what grants scoped access; middleware/tournamentAccess.ts enforces it.
// These functions are only ever called from super-admin-gated endpoints.
import { Role } from '@prisma/client';
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
    { email: user.email, name: user.name },
    tempPassword,
    input.tournamentName,
    `${clientOrigin()}${managePath(input.tournamentId)}`,
  ).catch((e) => logger.error('organizer.welcome_email_failed', { userId: user.id, e: String(e) }));

  logger.info('organizer.account_provisioned', { userId: user.id, tournamentId: input.tournamentId }); // no password
  return { userId: user.id };
}

/** Grant organiser access (idempotent — re-adding is a no-op, never a duplicate). */
export async function assignOrganizer(tournamentId: string, userId: string, addedById: string) {
  return prisma.tournamentOrganizer.upsert({
    where: { tournamentId_userId: { tournamentId, userId } },
    create: { tournamentId, userId, addedById },
    update: {},
  });
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

/** Revoke — access is checked live per request, so this takes effect immediately. */
export async function revokeOrganizer(tournamentId: string, userId: string): Promise<void> {
  await prisma.tournamentOrganizer.deleteMany({ where: { tournamentId, userId } });
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

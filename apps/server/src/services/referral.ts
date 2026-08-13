import prisma from '../config/db';
import logger from '../utils/logger';

/**
 * Attribute a new signup to whoever invited them. Accepts either a contextual
 * Invite code or a personal referralCode. Sets the new user's referredById and
 * marks the invite accepted. Best-effort — never blocks or breaks signup.
 */
export async function attributeReferral(newUserId: string, code: string | undefined | null): Promise<void> {
  if (!code) return;
  try {
    const invite = await prisma.invite.findUnique({ where: { code }, select: { id: true, inviterId: true, acceptedById: true } });
    if (invite && invite.inviterId !== newUserId) {
      await prisma.user.update({ where: { id: newUserId }, data: { referredById: invite.inviterId } });
      if (!invite.acceptedById) {
        await prisma.invite.update({ where: { id: invite.id }, data: { acceptedById: newUserId, acceptedAt: new Date() } });
      }
      logger.info('referral.attributed', { newUserId, inviterId: invite.inviterId, via: 'invite' });
      return;
    }
    const inviter = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (inviter && inviter.id !== newUserId) {
      await prisma.user.update({ where: { id: newUserId }, data: { referredById: inviter.id } });
      logger.info('referral.attributed', { newUserId, inviterId: inviter.id, via: 'referralCode' });
    }
  } catch (e) {
    logger.warn('referral.attribute_failed', { newUserId, error: String(e) });
  }
}

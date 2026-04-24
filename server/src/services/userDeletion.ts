import prisma from '../config/db';
import admin from '../config/firebaseAdmin';
import logger from '../utils/logger';

/**
 * Fully delete a user: Firebase Auth record first so their tokens are
 * invalidated immediately, then the Prisma row (cascade removes related data).
 *
 * Firebase deletion is best-effort — a missing record (user already removed
 * from the Auth side) is not an error, so we swallow auth/user-not-found and
 * log anything else before rethrowing.
 */
export async function deleteUserCompletely(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firebaseUid: true },
  });
  if (!user) throw new Error('User not found');

  if (user.firebaseUid) {
    try {
      await admin.auth().deleteUser(user.firebaseUid);
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        logger.warn('userDeletion.firebase_already_gone', { userId, firebaseUid: user.firebaseUid });
      } else {
        logger.error('userDeletion.firebase_failed', {
          userId,
          firebaseUid: user.firebaseUid,
          message: err?.message,
        });
        throw err;
      }
    }
  }

  await prisma.user.delete({ where: { id: userId } });
}

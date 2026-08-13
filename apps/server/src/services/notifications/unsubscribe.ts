import prisma from '../../config/db';
import { env } from '../../config/env';
import { generateSecureToken } from '../../utils/crypto';
import type { NotificationType } from '@prisma/client';

const clientOrigin = Array.isArray(env.CLIENT_URL) ? env.CLIENT_URL[0] : env.CLIENT_URL;

/** Get (or lazily create + persist) a user's one-click email-unsubscribe token. */
export async function ensureUnsubToken(userId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = generateSecureToken();
  try {
    await prisma.user.update({ where: { id: userId }, data: { notificationUnsubToken: token } });
  } catch {
    /* column not migrated yet — token still works for this send, just isn't stored */
  }
  return token;
}

/** Branded client page that unsubscribes on load. Omitting `type` unsubscribes from all. */
export function unsubscribeUrl(token: string, type?: NotificationType): string {
  const q = new URLSearchParams({ token });
  if (type) q.set('type', type);
  return `${clientOrigin}/unsubscribe?${q.toString()}`;
}

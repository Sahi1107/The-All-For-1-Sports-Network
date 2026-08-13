import webpush from 'web-push';
import { env } from '../../config/env';
import logger from '../../utils/logger';

// Web push transport. Disabled (a no-op) unless VAPID keys are set, so nothing
// breaks before they're generated. Generate with: npx web-push generate-vapid-keys
export const pushEnabled = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  logger.info('webpush.enabled');
}

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }
export interface PushPayload { title: string; body: string; url?: string; tag?: string }

/**
 * Send a push. Returns 'ok' | 'gone' (subscription expired — caller should delete)
 * | 'error'. Never throws.
 */
export async function sendWebPush(sub: PushSub, payload: PushPayload): Promise<'ok' | 'gone' | 'error'> {
  if (!pushEnabled) return 'error';
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return 'ok';
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return 'gone';
    logger.warn('webpush.send_failed', { status, error: String(e) });
    return 'error';
  }
}

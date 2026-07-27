import prisma from '../../../config/db';
import type { NotificationType } from '@prisma/client';
import { CATALOG, renderCopy, type NotifCtx } from '../catalog';
import { sendWebPush, pushEnabled } from '../webpush';

export interface PushInput {
  recipientId: string;
  type: NotificationType;
  ctx: NotifCtx;
  link: string | null;
}

/**
 * Push channel — sends a web push to each of the user's subscriptions (and prunes
 * any that have expired). No-ops until VAPID keys are configured. This is the ONE
 * place that changed to light up push: the dispatcher already computes prefs +
 * pause + quiet hours and calls this exactly like in-app and email.
 */
export async function deliverPush(input: PushInput): Promise<void> {
  if (!pushEnabled) return;
  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId: input.recipientId } });
  } catch { return; }
  if (subs.length === 0) return;

  const { title, message } = renderCopy(input.type, { ...input.ctx, count: input.ctx.count ?? 1 });
  const payload = { title: title || CATALOG[input.type].label, body: message, url: input.link ?? '/notifications', tag: input.type };

  await Promise.all(subs.map(async (s) => {
    const r = await sendWebPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    if (r === 'gone') await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
  }));
}

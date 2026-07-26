import type { NotificationType } from '@prisma/client';
import type { NotifCtx } from '../catalog';

export interface PushInput {
  recipientId: string;
  type: NotificationType;
  ctx: NotifCtx;
  link: string | null;
}

/**
 * Push channel — intentionally a no-op stub. When the mobile app ships, this is
 * the ONLY place that changes: register device tokens, then send here (honouring
 * the same preferences + quiet hours the dispatcher already computes). The
 * dispatcher calls this exactly like the in-app and email channels, so push
 * slots in as just another channel with no rebuild.
 */
export async function deliverPush(_input: PushInput): Promise<void> {
  // no-op until FCM/APNs + device-token registration is wired
  return;
}

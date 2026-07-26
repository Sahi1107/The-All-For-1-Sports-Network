import prisma from '../../../config/db';
import type { NotificationType } from '@prisma/client';
import { renderCopy, type NotifCtx } from '../catalog';
import { emitToUser } from '../realtime';

export interface InAppInput {
  recipientId: string;
  type: NotificationType;
  actorId: string | null;
  referenceId: string | null;
  link: string | null;
  groupKey: string | null;
  ctx: NotifCtx;
  override: { title: string; message: string } | null; // verbatim copy for sub-variants
  collapsible: boolean;
  collapseWindowMins: number;
}

export interface InAppResult { id: string; created: boolean; alreadyEmailed: boolean }

/**
 * Write the in-app notification. Collapsible types fold into the most recent
 * UNREAD row with the same groupKey ("5 people liked your post") instead of
 * creating N rows; otherwise a new row is created. Emits a real-time event.
 */
export async function deliverInApp(i: InAppInput): Promise<InAppResult> {
  if (i.collapsible && i.groupKey) {
    const since = new Date(Date.now() - i.collapseWindowMins * 60 * 1000);
    const existing = await prisma.notification.findFirst({
      where: { userId: i.recipientId, groupKey: i.groupKey, read: false, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      const count = existing.count + 1;
      const { title, message } = renderCopy(i.type, { ...i.ctx, count });
      const updated = await prisma.notification.update({
        where: { id: existing.id },
        data: {
          count, title, message,
          actorId: i.actorId,
          referenceId: i.referenceId ?? existing.referenceId,
          link: i.link ?? existing.link,
          updatedAt: new Date(),
        },
      });
      emitToUser(i.recipientId, 'notification', { id: updated.id, collapsed: true });
      return { id: updated.id, created: false, alreadyEmailed: !!existing.emailedAt };
    }
  }

  const { title, message } = i.override ?? renderCopy(i.type, { ...i.ctx, count: 1 });
  const created = await prisma.notification.create({
    data: {
      userId: i.recipientId, type: i.type, title, message,
      actorId: i.actorId, referenceId: i.referenceId, link: i.link,
      groupKey: i.groupKey, count: 1,
    },
  });
  emitToUser(i.recipientId, 'notification', { id: created.id, collapsed: false });
  return { id: created.id, created: true, alreadyEmailed: false };
}

import prisma from '../../../config/db';
import { env } from '../../../config/env';
import type { NotificationType } from '@prisma/client';
import { CATALOG, renderCopy, type NotifCtx } from '../catalog';
import { ensureUnsubToken, unsubscribeUrl } from '../unsubscribe';
import { sendNotificationEmail } from '../../email';

const clientOrigin = Array.isArray(env.CLIENT_URL) ? env.CLIENT_URL[0] : env.CLIENT_URL;

export interface EmailChannelInput {
  recipient: { id: string; email: string; name: string; notificationUnsubToken: string | null };
  type: NotificationType;
  ctx: NotifCtx;
  link: string | null;
  notifId: string | null; // in-app row to mark emailed (dedup)
}

const CTA_LABEL: Partial<Record<NotificationType, string>> = {
  CONNECTION_REQUEST: 'View request',
  TEAM_INVITE: 'View invite',
  TEAM_JOIN_REQUEST: 'Review request',
  ENDORSEMENT: 'View your profile',
  STATS_VERIFIED: 'View Performance Card',
  MATCH_RESULT_PUBLISHED: 'View result',
  MATCH_STARTING_SOON: 'View match',
  REGISTRATION_OPEN: 'View tournament',
  REGISTRATION_CLOSING: 'Register now',
  DRAW_PUBLISHED: 'View draw',
  FIXTURES_SCHEDULED: 'View fixtures',
  RANKING_MILESTONE: 'View rankings',
  PROFILE_VIEWS_WEEKLY: 'View your profile',
};

/** Send a single branded notification email + mark the in-app row as emailed. */
export async function deliverEmail(i: EmailChannelInput): Promise<void> {
  const meta = CATALOG[i.type];
  const { message } = renderCopy(i.type, { ...i.ctx, count: i.ctx.count ?? 1 });
  const token = await ensureUnsubToken(i.recipient.id, i.recipient.notificationUnsubToken);

  await sendNotificationEmail({
    to: i.recipient.email,
    recipientName: i.recipient.name,
    subject: meta.emailSubject(i.ctx),
    heading: meta.title(i.ctx),
    body: message,
    ctaUrl: i.link ? `${clientOrigin}${i.link}` : clientOrigin,
    ctaLabel: CTA_LABEL[i.type] ?? 'Open All For 1',
    unsubscribeUrl: unsubscribeUrl(token, i.type),
    unsubscribeAllUrl: unsubscribeUrl(token),
    category: meta.label,
  });

  if (i.notifId) {
    await prisma.notification.update({ where: { id: i.notifId }, data: { emailedAt: new Date() } }).catch(() => {});
  }
}

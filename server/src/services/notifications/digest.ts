import prisma from '../../config/db';
import { env } from '../../config/env';
import logger from '../../utils/logger';
import type { DigestFrequency } from '@prisma/client';
import { resolveAllPreferences } from './preferences';
import { inQuietHours, notify } from './notify';
import { ensureUnsubToken, unsubscribeUrl } from './unsubscribe';
import { sendDigestEmail, sendNotificationEmail } from '../email';
import { CATALOG } from './catalog';

const clientOrigin = Array.isArray(env.CLIENT_URL) ? env.CLIENT_URL[0] : env.CLIENT_URL;

export type DigestTask = 'instant' | 'daily' | 'weekly';
const WINDOW_MS: Record<DigestTask, number> = {
  instant: 3 * 60 * 60 * 1000,       // catch instant emails deferred by quiet hours
  daily:   26 * 60 * 60 * 1000,
  weekly:  8 * 24 * 60 * 60 * 1000,
};
const FREQ: Record<DigestTask, DigestFrequency> = { instant: 'INSTANT', daily: 'DAILY', weekly: 'WEEKLY' };

/**
 * Run a digest task. Called by Cloud Scheduler via POST /api/notifications/cron/digest
 * (see route). Bundles each user's un-emailed notifications whose per-type digest
 * matches the task into a single email (daily/weekly), or flushes quiet-hours-
 * deferred instant emails individually, then marks them emailed so they never
 * send twice.
 */
export async function runDigestTask(task: DigestTask): Promise<{ users: number; emails: number }> {
  const since = new Date(Date.now() - WINDOW_MS[task]);
  const freq = FREQ[task];

  const candidates = await prisma.notification.findMany({
    where: { emailedAt: null, createdAt: { gte: since } },
    select: { userId: true },
    distinct: ['userId'],
  });

  let emails = 0;
  for (const { userId } of candidates) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, notificationsPaused: true, notifyQuietStart: true, notifyQuietEnd: true, notificationUnsubToken: true },
      });
      if (!user?.email || user.notificationsPaused) continue;
      if (task === 'instant' && inQuietHours(user.notifyQuietStart, user.notifyQuietEnd)) continue; // still quiet — try next run

      const prefs = await resolveAllPreferences(userId);
      const pending = await prisma.notification.findMany({
        where: { userId, emailedAt: null, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
      });
      const due = pending.filter((n) => {
        const p = prefs[n.type];
        return p && p.email && p.digest === freq && CATALOG[n.type].configurable;
      });
      if (due.length === 0) continue;

      const token = await ensureUnsubToken(user.id, user.notificationUnsubToken);
      if (task === 'instant') {
        for (const n of due) {
          await sendNotificationEmail({
            to: user.email, recipientName: user.name,
            subject: n.message, heading: n.title, body: n.message,
            ctaUrl: n.link ? `${clientOrigin}${n.link}` : clientOrigin, ctaLabel: 'Open All For 1',
            unsubscribeUrl: unsubscribeUrl(token, n.type), unsubscribeAllUrl: unsubscribeUrl(token),
            category: CATALOG[n.type].label,
          });
        }
      } else {
        await sendDigestEmail({
          to: user.email,
          subject: task === 'daily' ? 'Your daily All For 1 digest' : 'Your week on All For 1',
          heading: task === 'daily' ? 'What you missed today' : 'Your week on All For 1',
          intro: `${due.length} update${due.length > 1 ? 's' : ''} from your network.`,
          items: due.map((n) => ({ title: n.title, body: n.message, url: n.link ? `${clientOrigin}${n.link}` : clientOrigin })),
          ctaUrl: clientOrigin,
          unsubscribeAllUrl: unsubscribeUrl(token),
          managed: 'You get this digest based on your notification settings',
        });
      }
      await prisma.notification.updateMany({ where: { id: { in: due.map((n) => n.id) } }, data: { emailedAt: new Date() } });
      emails += 1;
    } catch (e) {
      logger.error('digest.user_failed', { userId, error: String(e) });
    }
  }

  if (task === 'weekly') await runWeeklyProfileViews();
  logger.info('digest.done', { task, users: candidates.length, emails });
  return { users: candidates.length, emails };
}

/** Weekly "your profile got N views" — one per athlete who had views this week. */
async function runWeeklyProfileViews(): Promise<void> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const grouped = await prisma.profileView.groupBy({
      by: ['targetId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      const count = g._count._all;
      if (count <= 0) continue;
      await notify({ recipientId: g.targetId, type: 'PROFILE_VIEWS_WEEKLY', ctx: { count }, link: `/profile/${g.targetId}` });
    }
  } catch (e) {
    logger.error('digest.weekly_views_failed', { error: String(e) });
  }
}

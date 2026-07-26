import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimiter';
import { CATALOG, preferenceMeta, CATEGORY_ORDER, CATEGORY_LABELS } from '../services/notifications/catalog';
import { resolveAllPreferences, defaultPref } from '../services/notifications/preferences';
import type { NotificationType } from '@prisma/client';

const router = Router();

const VALID_TYPES = new Set(Object.keys(CATALOG) as NotificationType[]);
const VALID_DIGEST = new Set(['INSTANT', 'DAILY', 'WEEKLY', 'OFF']);
const isType = (t: unknown): t is NotificationType => typeof t === 'string' && VALID_TYPES.has(t as NotificationType);

// Notifications live for 56 days, then they're dropped from view and pruned.
const NOTIFICATION_TTL_DAYS = 56;

// GET /api/notifications
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '30' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const cutoff = new Date(Date.now() - NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Best-effort prune of expired notifications for this user; don't block on it
    prisma.notification
      .deleteMany({ where: { userId: req.user!.userId, createdAt: { lt: cutoff } } })
      .catch((err) => console.error('Prune old notifications failed:', err));

    const baseWhere = { userId: req.user!.userId, createdAt: { gte: cutoff } };

    const [rawNotifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: baseWhere,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: baseWhere }),
      prisma.notification.count({ where: { ...baseWhere, read: false } }),
    ]);

    // Resolve the actor: prefer the dedicated actorId; fall back to referenceId
    // for legacy social rows created before actorId existed.
    const LEGACY_ACTOR_TYPES = ['FOLLOW', 'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'ENDORSEMENT'];
    const actorOf = (n: any): string | null =>
      n.actorId ?? (LEGACY_ACTOR_TYPES.includes(n.type) ? n.referenceId : null);

    const actorIds = [...new Set(rawNotifications.map(actorOf).filter(Boolean))] as string[];

    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, avatar: true, role: true, sport: true },
        })
      : [];
    const actorMap = Object.fromEntries(actors.map((a: any) => [a.id, a]));

    const notifications = rawNotifications.map((n: any) => {
      const aid = actorOf(n);
      return { ...n, actor: aid ? actorMap[aid] ?? null : null };
    });

    res.json({ notifications, total, unreadCount, page: parseInt(page as string) });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id as string, userId: req.user!.userId },
      data: { read: true },
    });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, read: false },
      data: { read: true },
    });
    res.json({ message: 'All marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Preferences ──────────────────────────────────────────────────────────────

// GET /api/notifications/preferences — catalog grouped by category + the user's
// effective settings, for the notification-settings screen.
router.get('/preferences', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.userId;
    const [meta, effective, user] = await Promise.all([
      preferenceMeta(),
      resolveAllPreferences(uid),
      prisma.user.findUnique({
        where: { id: uid },
        select: { notificationsPaused: true, notifyQuietStart: true, notifyQuietEnd: true },
      }),
    ]);
    const categories = CATEGORY_ORDER.map((cat) => ({
      key: cat,
      label: CATEGORY_LABELS[cat],
      types: meta.filter((m) => m.category === cat).map((m) => ({ ...m, effective: effective[m.type] })),
    })).filter((c) => c.types.length);
    res.json({
      categories,
      global: {
        paused: user?.notificationsPaused ?? false,
        quietStart: user?.notifyQuietStart ?? null,
        quietEnd: user?.notifyQuietEnd ?? null,
      },
    });
  } catch (error) {
    console.error('Get notification prefs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/preferences — update global controls and/or per-type
// overrides. Body: { global?: {paused?,quietStart?,quietEnd?}, prefs?: [{type,inApp?,email?,digest?}] }
router.patch('/preferences', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.userId;
    const { global, prefs } = req.body ?? {};

    if (global && typeof global === 'object') {
      const data: Record<string, unknown> = {};
      if (typeof global.paused === 'boolean') data.notificationsPaused = global.paused;
      const validHour = (h: unknown) => h === null || (Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23);
      if ('quietStart' in global && validHour(global.quietStart)) data.notifyQuietStart = global.quietStart;
      if ('quietEnd' in global && validHour(global.quietEnd)) data.notifyQuietEnd = global.quietEnd;
      if (Object.keys(data).length) await prisma.user.update({ where: { id: uid }, data }).catch(() => {});
    }

    if (Array.isArray(prefs)) {
      for (const p of prefs) {
        if (!p || !isType(p.type) || !CATALOG[p.type as NotificationType].configurable) continue;
        const type = p.type as NotificationType;
        const base = defaultPref(type);
        const digest = VALID_DIGEST.has(p.digest) ? p.digest : undefined;
        await prisma.notificationPreference.upsert({
          where: { userId_type: { userId: uid, type } },
          create: {
            userId: uid, type,
            inApp:  typeof p.inApp === 'boolean' ? p.inApp : base.inApp,
            email:  typeof p.email === 'boolean' ? p.email : base.email,
            digest: digest ?? base.digest,
          },
          update: {
            ...(typeof p.inApp === 'boolean' && { inApp: p.inApp }),
            ...(typeof p.email === 'boolean' && { email: p.email }),
            ...(digest && { digest }),
          },
        }).catch(() => {});
      }
    }

    const effective = await resolveAllPreferences(uid);
    res.json({ effective });
  } catch (error) {
    console.error('Update notification prefs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/unsubscribe — one-click email unsubscribe from an email
// link. Token-authenticated (no login). Omit `type` to unsubscribe from ALL
// activity emails. Security/account (SYSTEM) email is never disabled.
router.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { token, type } = req.body ?? {};
    if (!token || typeof token !== 'string') { res.status(400).json({ error: 'Missing token' }); return; }
    const user = await prisma.user.findUnique({ where: { notificationUnsubToken: token }, select: { id: true } });
    if (!user) { res.status(404).json({ error: 'This unsubscribe link is no longer valid.' }); return; }

    if (isType(type) && CATALOG[type as NotificationType].configurable) {
      const t = type as NotificationType;
      await prisma.notificationPreference.upsert({
        where: { userId_type: { userId: user.id, type: t } },
        create: { userId: user.id, type: t, ...defaultPref(t), email: false },
        update: { email: false },
      });
      res.json({ scope: 'type', type: t, label: CATALOG[t].label });
      return;
    }

    const configurable = preferenceMeta().filter((m) => m.configurable);
    await prisma.$transaction(configurable.map((m) => prisma.notificationPreference.upsert({
      where: { userId_type: { userId: user.id, type: m.type } },
      create: { userId: user.id, type: m.type, inApp: m.default.inApp, email: false, digest: m.default.digest },
      update: { email: false },
    })));
    res.json({ scope: 'all' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

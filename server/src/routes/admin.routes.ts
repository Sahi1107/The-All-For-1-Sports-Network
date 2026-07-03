import { Router, Response } from 'express';
import { Sport } from '@prisma/client';
import prisma from '../config/db';
import admin from '../config/firebaseAdmin';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import {
  AdminUserListQuery, AdminUpdateRoleBody, AdminVerifyBody, CreateAdminBody,
  BulkProvisionBody, BulkProvisionParams, StandaloneBulkProvisionBody,
  AdminReportListQuery, AdminReportStatusBody, AdminCreateAthleteBody,
} from '../validation/admin';
import { deleteUserCompletely } from '../services/userDeletion';
import { provisionAthleteAccount } from '../services/provisionAthlete';
import { getIO } from '../config/socket';
import {
  buildReport, commitBulkProvision, normalizeEmail,
  tournamentToContext, standaloneContext,
  type TournamentContext,
} from '../services/bulkProvision';
import logger from '../utils/logger';

const router = Router();

// All admin routes require ADMIN role
router.use(authenticate, requireRole('ADMIN'));

// GET /api/admin/users — list all users
router.get('/users', validate({ query: AdminUserListQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { role, sport, search, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (role) where.role = role;
    if (sport) where.sport = sport;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, role: true, sport: true,
          avatar: true, verified: true, createdAt: true,
          _count: { select: { highlights: true, followers: true } },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id/verify
router.patch('/users/:id/verify', validate({ body: AdminVerifyBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { verified } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { verified: verified ?? true },
    });
    res.json({ message: 'User updated', userId: user.id, verified: user.verified });
  } catch (error) {
    console.error('Verify user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', validate({ body: AdminUpdateRoleBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role, ...(role === 'ADMIN' && { sport: null }) },
    });

    // Keep Firebase custom claims in sync so the user's next token has the new role
    if (user.firebaseUid) {
      await admin.auth().setCustomUserClaims(user.firebaseUid, { userId: user.id, role: user.role });
    }

    res.json({ message: 'Role updated', userId: user.id, role: user.role });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Prevent an admin from deleting their own account via this endpoint
    if (req.params.id as string === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }
    await deleteUserCompletely(req.params.id as string);
    logger.info('admin.user_deleted', { actorId: req.user!.userId, targetId: req.params.id });
    res.json({ message: 'User deleted' });
  } catch (error: any) {
    if (error?.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/create-admin — create a new admin account
router.post('/create-admin', writeLimiter, validate({ body: CreateAdminBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { email, name, password } = req.body;

    // Check Prisma first to surface a friendly duplicate-email error
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    // 1. Create Firebase Auth user (emailVerified: true — no verification needed)
    const firebaseUser = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
    });

    // 2. Create Prisma user linked to Firebase UID
    const newAdmin = await prisma.user.create({
      data: {
        firebaseUid: firebaseUser.uid,
        email,
        name,
        role:     'ADMIN',
        sport:    'BASKETBALL',
        verified: true,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    // 3. Set custom claims so the new admin's tokens carry userId + role
    await admin.auth().setCustomUserClaims(firebaseUser.uid, {
      userId: newAdmin.id,
      role:   'ADMIN',
    });

    logger.info('admin.create_admin', { createdId: newAdmin.id, byAdminId: req.user!.userId });
    res.status(201).json({ admin: newAdmin });
  } catch (error: any) {
    if (error?.code === 'auth/email-already-exists') {
      res.status(409).json({ error: 'Email already registered in Firebase' });
      return;
    }
    logger.error('Create admin error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/athletes — create a single claimable athlete/coach profile.
// Delegates to provisionAthleteAccount so DOB / under-13 guardian-consent /
// private-by-default / welcome-email rules are enforced identically to bulk.
router.post('/athletes', writeLimiter, validate({ body: AdminCreateAthleteBody }), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body;
    const result = await provisionAthleteAccount({
      name: b.name,
      email: b.email,
      role: b.role,
      sport: b.sport,
      dateOfBirth: b.dateOfBirth ? new Date(b.dateOfBirth) : null,
      gender: b.gender,
      position: b.position,
      phone: b.phone,
      guardianEmail: b.guardianEmail,
    });

    // An existing account by this email was linked, not created — for a single
    // create that's a conflict the admin should see.
    if (!result.created) {
      res.status(409).json({ error: 'An account with that email already exists' });
      return;
    }

    logger.info('admin.athlete_created', {
      actorId: req.user!.userId,
      userId: result.userId,
      guardianConsentPending: result.guardianConsentPending,
    });
    res.status(201).json(result);
  } catch (error: any) {
    if (error?.name === 'ProvisionError') {
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error('Admin create athlete error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/stats — platform statistics
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsers, athletes, coaches, scouts, agents, teamAccounts, mediaAccounts, verifiedUsers,
      highlights, teams, tournaments,
      bySportRows,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ATHLETE' } }),
      prisma.user.count({ where: { role: 'COACH' } }),
      prisma.user.count({ where: { role: 'SCOUT' } }),
      prisma.user.count({ where: { role: 'AGENT' } }),
      prisma.user.count({ where: { role: 'TEAM' } }),
      prisma.user.count({ where: { role: 'MEDIA' } }),
      prisma.user.count({ where: { verified: true } }),
      prisma.highlight.count(),
      prisma.team.count(),
      prisma.tournament.count(),
      prisma.user.groupBy({
        by: ['sport'],
        where: { sport: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const bySport: Record<string, number> = Object.fromEntries(
      Object.values(Sport).map((s) => [s, 0]),
    );
    for (const row of bySportRows) {
      if (row.sport) bySport[row.sport] = row._count._all;
    }

    res.json({
      stats: {
        totalUsers, athletes, coaches, scouts, agents, teamAccounts, mediaAccounts, verifiedUsers,
        highlights, teams, tournaments,
        bySport,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Moderation queue ────────────────────────────────────────────────────────
//
// Reports are created by users (account-level and content-level: post, comment,
// message). Admins triage them (status) and can act directly: remove the
// specific reported content, or delete the whole account via DELETE /users/:id.

const REPORTER_SELECT = { id: true, name: true, avatar: true } as const;
const REPORTED_SELECT = { id: true, name: true, avatar: true, role: true } as const;

/**
 * Fetch a short preview of each report's target content so moderators aren't
 * judging blind. Batches one query per content type, then maps back by id.
 * Returns, per report id: the preview text and whether the content still exists.
 */
async function resolveContentPreviews(
  reports: { id: string; targetType: string; targetId: string | null }[],
): Promise<Record<string, { preview: string | null; exists: boolean }>> {
  const ids = { POST: [] as string[], COMMENT: [] as string[], MESSAGE: [] as string[] };
  for (const r of reports) {
    if (r.targetId && (r.targetType === 'POST' || r.targetType === 'COMMENT' || r.targetType === 'MESSAGE')) {
      ids[r.targetType].push(r.targetId);
    }
  }

  const [posts, comments, messages] = await Promise.all([
    ids.POST.length
      ? prisma.post.findMany({ where: { id: { in: ids.POST } }, select: { id: true, content: true, title: true } })
      : [],
    ids.COMMENT.length
      ? prisma.postComment.findMany({ where: { id: { in: ids.COMMENT } }, select: { id: true, content: true } })
      : [],
    ids.MESSAGE.length
      ? prisma.message.findMany({ where: { id: { in: ids.MESSAGE } }, select: { id: true, content: true, deletedAt: true } })
      : [],
  ]);

  const trunc = (s: string | null | undefined) =>
    s ? (s.length > 200 ? `${s.slice(0, 200)}…` : s) : '';

  const postMap = new Map(posts.map((p) => [p.id, trunc(p.content || p.title)]));
  const commentMap = new Map(comments.map((c) => [c.id, trunc(c.content)]));
  const messageMap = new Map(messages.map((m) => [m.id, m.deletedAt ? '[message already removed]' : trunc(m.content)]));

  const out: Record<string, { preview: string | null; exists: boolean }> = {};
  for (const r of reports) {
    if (!r.targetId || r.targetType === 'USER') { out[r.id] = { preview: null, exists: true }; continue; }
    const map = r.targetType === 'POST' ? postMap : r.targetType === 'COMMENT' ? commentMap : messageMap;
    const exists = map.has(r.targetId);
    out[r.id] = { preview: exists ? (map.get(r.targetId) ?? '') : null, exists };
  }
  return out;
}

// GET /api/admin/reports — moderation queue, filterable by status + target type
router.get('/reports', validate({ query: AdminReportListQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { status, targetType, page = '1', limit = '50' } = req.query;
    const take = parseInt(limit as string);
    const skip = (parseInt(page as string) - 1) * take;

    const where: any = {};
    if (status) where.status = status;
    if (targetType) where.targetType = targetType;

    const [rows, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: { select: REPORTER_SELECT },
          reported: { select: REPORTED_SELECT },
        },
        // Open reports first, then newest.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      prisma.report.count({ where }),
    ]);

    const previews = await resolveContentPreviews(rows);
    const reports = rows.map((r) => ({
      ...r,
      contentPreview: previews[r.id]?.preview ?? null,
      contentExists: previews[r.id]?.exists ?? true,
    }));

    res.json({ reports, total, page: parseInt(page as string), totalPages: Math.ceil(total / take) });
  } catch (error) {
    console.error('Admin list reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/reports/:id — triage a report (change its status)
router.patch('/reports/:id', validate({ body: AdminReportStatusBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const report = await prisma.report.findUnique({ where: { id: req.params.id as string } });
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }
    const updated = await prisma.report.update({
      where: { id: report.id },
      data: { status },
    });
    logger.info('admin.report_status', { actorId: req.user!.userId, reportId: report.id, status });
    res.json({ report: updated });
  } catch (error) {
    console.error('Admin update report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/reports/:id/content — remove the reported content itself.
// Resolves the report's target, deletes it (posts/comments hard, messages soft +
// realtime event), and marks every report for that same content ACTIONED.
router.delete('/reports/:id/content', async (req: AuthRequest, res: Response) => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id as string } });
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }
    if (report.targetType === 'USER' || !report.targetId) {
      res.status(400).json({ error: 'This report has no removable content. Delete the account instead.' });
      return;
    }

    const { targetType, targetId } = report;
    let removed = false;

    try {
      if (targetType === 'POST') {
        await prisma.post.delete({ where: { id: targetId } });
        removed = true;
      } else if (targetType === 'COMMENT') {
        await prisma.postComment.delete({ where: { id: targetId } });
        removed = true;
      } else if (targetType === 'MESSAGE') {
        const msg = await prisma.message.findUnique({
          where: { id: targetId },
          select: { conversationId: true, deletedAt: true },
        });
        if (msg && !msg.deletedAt) {
          await prisma.message.update({
            where: { id: targetId },
            data: { deletedAt: new Date(), content: '' },
          });
          removed = true;
          try {
            getIO().to(`conversation:${msg.conversationId}`).emit('message_deleted', {
              id: targetId, deletedAt: new Date().toISOString(),
            });
          } catch { /* socket not critical to the removal */ }
        }
      }
    } catch (err: any) {
      // P2025 = record already gone; treat as already-removed (idempotent).
      if (err?.code !== 'P2025') throw err;
    }

    // Resolve every report pointing at this same content, not just this one.
    await prisma.report.updateMany({
      where: { targetType, targetId },
      data: { status: 'ACTIONED' },
    });

    logger.info('admin.content_removed', {
      actorId: req.user!.userId, reportId: report.id, targetType, targetId, removed,
    });
    res.json({ removed, message: removed ? 'Content removed' : 'Content was already removed' });
  } catch (error) {
    console.error('Admin remove content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Bulk provisioning (tournament roster import) ────────────────────────────
//
// Admin-only path to provision a whole tournament's rosters from a CSV without
// the self-serve invite/accept handshake. Preview validates and classifies;
// commit creates missing accounts, links existing ones, builds teams, and adds
// every member as ACCEPTED. The existing invite flow is untouched.

/** Load the tournament fields the provisioner needs, or null if not found. */
async function loadTournamentContext(tournamentId: string): Promise<TournamentContext | null> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, name: true, sport: true, genderCategory: true, minRosterSize: true, maxRosterSize: true },
  });
  return t;
}

// POST /api/admin/tournaments/:tournamentId/bulk-provision/preview
router.post(
  '/tournaments/:tournamentId/bulk-provision/preview',
  writeLimiter,
  validate({ params: BulkProvisionParams, body: BulkProvisionBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournament = await loadTournamentContext(req.params.tournamentId as string);
      if (!tournament) {
        res.status(404).json({ error: 'Tournament not found' });
        return;
      }

      const rows = req.body.rows as any[];
      const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter(Boolean))];
      const existing = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      });
      const existingEmails = new Set(existing.map((u) => u.email));

      const { report } = buildReport(rows, tournamentToContext(tournament), existingEmails);
      res.json({ report });
    } catch (error) {
      logger.error('Bulk provision preview error', { error: String(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/admin/tournaments/:tournamentId/bulk-provision/commit
router.post(
  '/tournaments/:tournamentId/bulk-provision/commit',
  writeLimiter,
  validate({ params: BulkProvisionParams, body: BulkProvisionBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournament = await loadTournamentContext(req.params.tournamentId as string);
      if (!tournament) {
        res.status(404).json({ error: 'Tournament not found' });
        return;
      }

      const result = await commitBulkProvision(req.body.rows as any[], tournamentToContext(tournament));
      logger.info('admin.bulk_provision', {
        actorId: req.user!.userId,
        tournamentId: tournament.id,
        created: result.accountsCreated,
        linked: result.accountsLinked,
      });
      res.json({ result });
    } catch (error: any) {
      if (error?.status === 422 && error?.blocking) {
        res.status(422).json({ error: 'Bulk provision blocked by validation errors', blockingErrors: error.blocking });
        return;
      }
      logger.error('Bulk provision commit error', { error: String(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Standalone bulk provisioning (no tournament) ────────────────────────────
//
// The same CSV pipeline and the same provisionAthleteAccount safety path, minus
// the tournament coupling: sport is chosen for the whole batch, team size is
// unbounded, team-less rows become plain profiles, and no TournamentTeam join is
// written. DOB / guardian-consent / private-by-default for minors are enforced
// identically (in buildReport + provisionAthleteAccount) — they cannot be bypassed.

// POST /api/admin/bulk-provision/preview
router.post(
  '/bulk-provision/preview',
  writeLimiter,
  validate({ body: StandaloneBulkProvisionBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const rows = req.body.rows as any[];
      const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter(Boolean))];
      const existing = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      });
      const existingEmails = new Set(existing.map((u) => u.email));

      const { report } = buildReport(rows, standaloneContext(req.body.sport), existingEmails);
      res.json({ report });
    } catch (error) {
      logger.error('Standalone bulk provision preview error', { error: String(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/admin/bulk-provision/commit
router.post(
  '/bulk-provision/commit',
  writeLimiter,
  validate({ body: StandaloneBulkProvisionBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await commitBulkProvision(req.body.rows as any[], standaloneContext(req.body.sport));
      logger.info('admin.bulk_provision_standalone', {
        actorId: req.user!.userId,
        sport: req.body.sport,
        created: result.accountsCreated,
        linked: result.accountsLinked,
        teams: result.teamsCreated,
      });
      res.json({ result });
    } catch (error: any) {
      if (error?.status === 422 && error?.blocking) {
        res.status(422).json({ error: 'Bulk provision blocked by validation errors', blockingErrors: error.blocking });
        return;
      }
      logger.error('Standalone bulk provision commit error', { error: String(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;

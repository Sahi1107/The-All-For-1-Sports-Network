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
  BulkProvisionBody, BulkProvisionParams,
} from '../validation/admin';
import { deleteUserCompletely } from '../services/userDeletion';
import {
  buildReport, commitBulkProvision, normalizeEmail,
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

      const { report } = buildReport(rows, tournament, existingEmails);
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

      const result = await commitBulkProvision(req.body.rows as any[], tournament);
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

export default router;

import { Router, Response } from 'express';
import { Role, Sport } from '@prisma/client';
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
  AdminCreateTeamBody, AdminTeamParams, AdminTeamMemberParams,
  AdminAddMemberBody, AdminTeamListQuery, AdminComposeTeamBody,
  AdminTournamentParams, AdminOrganizerParams, AdminAddOrganizerBody, AdminUserLookupQuery,
} from '../validation/admin';
import { AdminSuspendBody, AdminAppealResolveBody, AdminAppealListQuery } from '../validation/appeal';
import { grantEffect, isResolution } from '../services/account/appeals';
import { deleteUserCompletely } from '../services/userDeletion';
import { provisionAthleteAccount, ProvisionError } from '../services/provisionAthlete';
import {
  findUserByEmail, provisionOrganizerAccount, assignOrganizer,
  revokeOrganizer, listOrganizers, listOrganizerAudit, notifyOrganizerAssigned,
  planOrganizerAdd,
} from '../services/tournamentOrganizer';
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
    if (search) {
      where.OR = [
        { name:  { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

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
// The DB row is the source of truth for authorization — `authenticate` reads role
// live from it every request — so the DB update IS the operation that must succeed
// or fail the request, and the persisted role is what we report back. The Firebase
// custom claim is no longer read for authz; it's kept in step best-effort, and a
// failure to sync it must NEVER turn a role change that already took effect into a
// reported failure (that false-negative is exactly what left admins guessing).
router.patch('/users/:id/role', validate({ body: AdminUpdateRoleBody }), async (req: AuthRequest, res: Response) => {
  const targetId = req.params.id as string;
  const { role } = req.body;

  let user: { id: string; role: string; firebaseUid: string | null };
  try {
    user = await prisma.user.update({
      where: { id: targetId },
      data: { role, ...(role === 'ADMIN' && { sport: null }) },
      select: { id: true, role: true, firebaseUid: true },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    logger.error('admin.update_role_failed', { targetId, error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  // Best-effort claim parity — surfaced, never fatal.
  let claimSynced = true;
  if (user.firebaseUid) {
    try {
      await admin.auth().setCustomUserClaims(user.firebaseUid, { userId: user.id, role: user.role });
    } catch (error) {
      claimSynced = false;
      logger.warn('admin.update_role.claim_sync_failed', { targetId, error: String(error) });
    }
  }

  // Echo the persisted role so the admin sees exactly what took effect. `effective`
  // is always true here: the change is live on the target's next request regardless
  // of whether the cosmetic claim sync happened to succeed.
  logger.info('admin.role_updated', { actorId: req.user!.userId, targetId, role: user.role, claimSynced });
  res.json({ message: 'Role updated', userId: user.id, role: user.role, effective: true, claimSynced });
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
      allowDuplicate: b.allowDuplicate,
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
      const status = error.code === 'DUPLICATE_WARNING' ? 409 : 400;
      res.status(status).json({ error: error.message, code: error.code, ...(error.data ?? {}) });
      return;
    }
    logger.error('Admin create athlete error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/teams — create a team with an existing profile as captain.
// Standalone by default; with a tournamentId the team is created inside that
// tournament and registered to it (TournamentTeam) in one action. Reuses the
// team model semantics of the tournament flow: the captain is also written as
// an ACCEPTED CAPTAIN member (admin authority — no invite/accept handshake).
router.post('/teams', writeLimiter, validate({ body: AdminCreateTeamBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { name, captainId, tournamentId } = req.body;
    let { sport } = req.body;

    // The captain must be an existing user.
    const captain = await prisma.user.findUnique({
      where: { id: captainId },
      select: { id: true, name: true, avatar: true, role: true },
    });
    if (!captain) {
      res.status(404).json({ error: 'Captain not found' });
      return;
    }

    // A tournament team inherits the tournament's sport.
    if (tournamentId) {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { id: true, sport: true },
      });
      if (!tournament) {
        res.status(404).json({ error: 'Tournament not found' });
        return;
      }
      sport = tournament.sport;
    }

    // Guard against accidental exact duplicates: same name within the tournament,
    // or same name + captain among standalone teams.
    const dup = await prisma.team.findFirst({
      where: tournamentId
        ? { tournamentId, name }
        : { tournamentId: null, name, captainId },
      select: { id: true },
    });
    if (dup) {
      res.status(409).json({
        error: tournamentId
          ? 'A team with that name already exists in this tournament'
          : 'A standalone team with that name and captain already exists',
      });
      return;
    }

    const team = await prisma.$transaction(async (tx) => {
      const t = await tx.team.create({
        data: { name, sport, captainId, tournamentId: tournamentId ?? null },
        select: { id: true, name: true, sport: true, captainId: true, tournamentId: true, createdAt: true },
      });
      // The captain is also a member — CAPTAIN, ACCEPTED (no invite).
      await tx.teamMember.create({
        data: { teamId: t.id, userId: captainId, role: 'CAPTAIN', status: 'ACCEPTED', respondedAt: new Date() },
      });
      // Register the team into the tournament (idempotent by unique constraint).
      if (tournamentId) {
        await tx.tournamentTeam.upsert({
          where: { tournamentId_teamId: { tournamentId, teamId: t.id } },
          create: { tournamentId, teamId: t.id },
          update: {},
        });
      }
      return t;
    });

    logger.info('admin.team_created', { actorId: req.user!.userId, teamId: team.id, captainId, tournamentId: tournamentId ?? null });
    res.status(201).json({ team: { ...team, captain: { id: captain.id, name: captain.name, avatar: captain.avatar } } });
  } catch (error) {
    logger.error('Admin create team error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Admin team member management + compose ──────────────────────────────────

/** A compose member: an existing profile (userId) or a new one to provision. */
interface ComposeMemberSpec {
  userId?: string;
  name?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: any;
  position?: string;
  phone?: string;
  guardianEmail?: string;
}

/**
 * Resolve one compose member to a userId. Existing profiles are looked up by id;
 * NEW profiles are created through provisionAthleteAccount — the single enforced
 * path — so DOB / under-13 guardian consent / private-by-default all apply and
 * cannot be bypassed.
 */
async function resolveComposeMember(
  spec: ComposeMemberSpec,
  sport: Sport,
  isCoach: boolean,
): Promise<{ userId: string; created: boolean; guardianConsentPending: boolean }> {
  if (spec.userId) {
    const u = await prisma.user.findUnique({ where: { id: spec.userId }, select: { id: true } });
    if (!u) throw new ProvisionError('One of the selected profiles no longer exists');
    return { userId: u.id, created: false, guardianConsentPending: false };
  }
  return provisionAthleteAccount({
    name: spec.name!,
    email: spec.email!,
    role: isCoach ? Role.COACH : Role.ATHLETE,
    sport,
    dateOfBirth: spec.dateOfBirth ? new Date(spec.dateOfBirth) : null,
    gender: spec.gender,
    position: spec.position,
    phone: spec.phone,
    guardianEmail: spec.guardianEmail,
  });
}

// GET /api/admin/teams — list teams (with captain + members) for member management
router.get('/teams', validate({ query: AdminTeamListQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { sport, search, page = '1', limit = '20' } = req.query as any;
    const take = parseInt(limit as string);
    const skip = (parseInt(page as string) - 1) * take;

    const where: any = {};
    if (sport) where.sport = sport;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        select: {
          id: true, name: true, sport: true, captainId: true, coachId: true, tournamentId: true,
          tournament: { select: { id: true, name: true } },
          members: {
            select: {
              role: true, status: true,
              user: { select: { id: true, name: true, avatar: true, role: true } },
            },
            orderBy: { role: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.team.count({ where }),
    ]);

    res.json({ teams, total, page: parseInt(page as string), totalPages: Math.ceil(total / take) });
  } catch (error) {
    logger.error('Admin list teams error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/teams/:teamId/members — add an existing profile as an ACCEPTED
// member (admin authority — bypasses the captain-only gate). PLAYER or COACH.
router.post(
  '/teams/:teamId/members',
  writeLimiter,
  validate({ params: AdminTeamParams, body: AdminAddMemberBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = req.params.teamId as string;
      const { userId, role } = req.body as { userId: string; role: 'PLAYER' | 'COACH' };

      const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, coachId: true } });
      if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) { res.status(404).json({ error: 'Profile not found' }); return; }

      // At most one coach: block a second, different coach.
      if (role === 'COACH' && team.coachId && team.coachId !== userId) {
        res.status(409).json({ error: 'This team already has a coach. Remove them first.' });
        return;
      }

      const member = await prisma.$transaction(async (tx) => {
        const m = await tx.teamMember.upsert({
          where: { teamId_userId: { teamId, userId } },
          create: { teamId, userId, role, status: 'ACCEPTED', respondedAt: new Date() },
          update: { role, status: 'ACCEPTED' },
          select: { role: true, status: true, user: { select: { id: true, name: true, avatar: true } } },
        });
        if (role === 'COACH') {
          await tx.team.update({ where: { id: teamId }, data: { coachId: userId } });
        }
        return m;
      });

      logger.info('admin.team_member_added', { actorId: req.user!.userId, teamId, userId, role });
      res.status(201).json({ member });
    } catch (error) {
      logger.error('Admin add member error', { error: String(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/admin/teams/:teamId/members/:userId — remove a member (admin
// authority). The captain can't be removed here (Team.captainId must stay valid).
router.delete(
  '/teams/:teamId/members/:userId',
  writeLimiter,
  validate({ params: AdminTeamMemberParams }),
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = req.params.teamId as string;
      const userId = req.params.userId as string;

      const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, captainId: true, coachId: true } });
      if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

      if (team.captainId === userId) {
        res.status(400).json({ error: 'The captain cannot be removed. Reassign the captain or delete the team.' });
        return;
      }

      const existing = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
        select: { id: true },
      });
      if (!existing) { res.status(404).json({ error: 'Member not found on this team' }); return; }

      await prisma.$transaction(async (tx) => {
        await tx.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
        if (team.coachId === userId) {
          await tx.team.update({ where: { id: teamId }, data: { coachId: null } });
        }
      });

      logger.info('admin.team_member_removed', { actorId: req.user!.userId, teamId, userId });
      res.json({ message: 'Member removed' });
    } catch (error) {
      logger.error('Admin remove member error', { error: String(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/admin/teams/compose — create a team + captain + players (+ optional
// coach) in one action. Existing members are added by id; NEW members are created
// through provisionAthleteAccount, so minor-safety cannot be bypassed. With a
// tournamentId the team is created inside that tournament and registered to it.
router.post('/teams/compose', writeLimiter, validate({ body: AdminComposeTeamBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { name, captain, players, coach, tournamentId } = req.body as {
      name: string; captain: ComposeMemberSpec; players: ComposeMemberSpec[];
      coach?: ComposeMemberSpec | null; tournamentId?: string;
    };
    let { sport } = req.body as { sport: Sport };

    // A tournament team inherits the tournament's sport; duplicate names within
    // the same tournament are rejected before any accounts are provisioned.
    if (tournamentId) {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { id: true, sport: true },
      });
      if (!tournament) {
        res.status(404).json({ error: 'Tournament not found' });
        return;
      }
      sport = tournament.sport;
      const dup = await prisma.team.findFirst({
        where: { tournamentId, name },
        select: { id: true },
      });
      if (dup) {
        res.status(409).json({ error: 'A team with that name already exists in this tournament' });
        return;
      }
    }

    // 1. Resolve every member first (provisioning new accounts through the
    //    enforced path). Done before the DB tx because Firebase Auth can't join it.
    const captainRes = await resolveComposeMember(captain, sport, false);
    const playerResults: Array<{ userId: string; created: boolean; guardianConsentPending: boolean }> = [];
    for (const p of players) playerResults.push(await resolveComposeMember(p, sport, false));
    const coachRes = coach ? await resolveComposeMember(coach, sport, true) : null;

    // 2. One role per person: captain > coach > player.
    const roleByUser = new Map<string, 'CAPTAIN' | 'COACH' | 'PLAYER'>();
    roleByUser.set(captainRes.userId, 'CAPTAIN');
    if (coachRes && !roleByUser.has(coachRes.userId)) roleByUser.set(coachRes.userId, 'COACH');
    for (const pr of playerResults) if (!roleByUser.has(pr.userId)) roleByUser.set(pr.userId, 'PLAYER');

    const coachId = coachRes && roleByUser.get(coachRes.userId) === 'COACH' ? coachRes.userId : null;

    // 3. Create the team + all ACCEPTED members (+ tournament registration)
    //    transactionally.
    const team = await prisma.$transaction(async (tx) => {
      const t = await tx.team.create({
        data: { name, sport, captainId: captainRes.userId, ...(coachId && { coachId }), tournamentId: tournamentId ?? null },
        select: { id: true, name: true, sport: true, tournamentId: true },
      });
      const now = new Date();
      for (const [userId, role] of roleByUser) {
        await tx.teamMember.create({ data: { teamId: t.id, userId, role, status: 'ACCEPTED', respondedAt: now } });
      }
      if (tournamentId) {
        await tx.tournamentTeam.upsert({
          where: { tournamentId_teamId: { tournamentId, teamId: t.id } },
          create: { tournamentId, teamId: t.id },
          update: {},
        });
      }
      return t;
    });

    const all = [captainRes, ...playerResults, ...(coachRes ? [coachRes] : [])];
    const accountsCreated = all.filter((r) => r.created).length;
    const guardianConsentPending = all.filter((r) => r.guardianConsentPending).length;

    logger.info('admin.team_composed', {
      actorId: req.user!.userId, teamId: team.id, members: roleByUser.size, accountsCreated, guardianConsentPending,
      tournamentId: tournamentId ?? null,
    });
    res.status(201).json({ team, membersAdded: roleByUser.size, accountsCreated, guardianConsentPending });
  } catch (error: any) {
    if (error?.name === 'ProvisionError') {
      const status = error.code === 'DUPLICATE_WARNING' ? 409 : 400;
      res.status(status).json({ error: error.message, code: error.code, ...(error.data ?? {}) });
      return;
    }
    logger.error('Admin compose team error', { error: String(error) });
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

    // Record the removal so the affected user can SEE it happened and appeal —
    // otherwise a hard delete leaves them nothing to contest.
    if (removed) {
      await prisma.moderationAction.create({
        data: {
          userId: report.reportedUserId,
          actorId: req.user!.userId,
          type: 'CONTENT_REMOVED',
          targetType,
          targetId,
          reason: report.reason,
          detail: `Your ${targetType.toLowerCase()} was removed for violating the community guidelines.`,
        },
      });
    }

    logger.info('admin.content_removed', {
      actorId: req.user!.userId, reportId: report.id, targetType, targetId, removed,
    });
    res.json({ removed, message: removed ? 'Content removed' : 'Content was already removed' });
  } catch (error) {
    console.error('Admin remove content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Trust & Safety: suspend / unsuspend a user ──────────────────────────────
router.patch('/users/:id/suspend', writeLimiter, validate({ body: AdminSuspendBody }), async (req: AuthRequest, res: Response) => {
  try {
    const targetId = req.params.id as string;
    const { suspend, reason } = req.body as { suspend: boolean; reason?: string };
    if (targetId === req.user!.userId) { res.status(400).json({ error: 'You cannot suspend your own account' }); return; }
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, firebaseUid: true } });
    if (!target) { res.status(404).json({ error: 'User not found' }); return; }
    if (target.role === 'ADMIN') { res.status(400).json({ error: 'Cannot suspend an admin account' }); return; }

    if (suspend) {
      // Suspend + kill sessions so it takes effect immediately.
      await prisma.user.update({
        where: { id: targetId },
        data: { suspended: true, suspendedAt: new Date(), suspensionReason: reason ?? null, sessionsRevokedAt: new Date() },
      });
      if (target.firebaseUid) { try { await admin.auth().revokeRefreshTokens(target.firebaseUid); } catch { /* best effort */ } }
      await prisma.moderationAction.create({
        data: { userId: targetId, actorId: req.user!.userId, type: 'SUSPEND', reason: reason ?? null, detail: reason ?? 'Your account was suspended for violating the community guidelines.' },
      });
    } else {
      await prisma.user.update({ where: { id: targetId }, data: { suspended: false, suspendedAt: null, suspensionReason: null } });
      await prisma.moderationAction.create({ data: { userId: targetId, actorId: req.user!.userId, type: 'UNSUSPEND' } });
    }
    logger.info('admin.user_suspension', { actorId: req.user!.userId, targetId, suspend });
    res.json({ suspended: suspend });
  } catch (error) {
    console.error('Admin suspend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Trust & Safety: appeals review ──────────────────────────────────────────
router.get('/appeals', validate({ query: AdminAppealListQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query as { status?: string };
    const page = parseInt((req.query.page as string) ?? '1');
    const limit = parseInt((req.query.limit as string) ?? '20');
    const where = status ? { status: status as any } : {};
    const [appeals, total] = await Promise.all([
      prisma.appeal.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, avatar: true, suspended: true } }, action: true },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.appeal.count({ where }),
    ]);
    res.json({ appeals, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Admin appeals list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/appeals/:id', writeLimiter, validate({ body: AdminAppealResolveBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { status, reviewNote } = req.body as { status: 'REVIEWING' | 'GRANTED' | 'DENIED'; reviewNote?: string };
    const appeal = await prisma.appeal.findUnique({ where: { id: req.params.id as string } });
    if (!appeal) { res.status(404).json({ error: 'Appeal not found' }); return; }

    const resolving = isResolution(status);
    const updated = await prisma.appeal.update({
      where: { id: appeal.id },
      data: { status, reviewNote: reviewNote ?? null, reviewedById: req.user!.userId, resolvedAt: resolving ? new Date() : null },
    });

    // Granting a suspension appeal lifts the suspension (content removals can't be undone).
    if (status === 'GRANTED' && grantEffect(appeal.kind).unsuspend) {
      await prisma.user.update({ where: { id: appeal.userId }, data: { suspended: false, suspendedAt: null, suspensionReason: null } });
      await prisma.moderationAction.create({ data: { userId: appeal.userId, actorId: req.user!.userId, type: 'UNSUSPEND', detail: 'Your suspension was lifted after review.' } });
    }
    logger.info('admin.appeal_resolved', { actorId: req.user!.userId, appealId: appeal.id, status });
    res.json({ appeal: updated });
  } catch (error) {
    console.error('Admin resolve appeal error:', error);
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
      // Unclaimed profiles have no email; they can't collide with an import row.
      const existingEmails = new Set(existing.flatMap((u) => (u.email ? [u.email] : [])));

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
      // Unclaimed profiles have no email; they can't collide with an import row.
      const existingEmails = new Set(existing.flatMap((u) => (u.email ? [u.email] : [])));

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

// ─── Tournament organiser management (super-admin only) ───────────────────────
// Organiser assignment grants tournament-SCOPED access (enforced by
// middleware/tournamentAccess). These management endpoints are ADMIN-only via the
// router-level guard above — an organiser can never add/remove organisers.

// GET /api/admin/users/lookup?email= — case detection for the add-organiser UI.
// Tells the client whether entering this email will assign an existing account or
// create a new one. Minimal projection; never leaks anything an admin can't see.
router.get('/users/lookup', validate({ query: AdminUserLookupQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const email = req.query.email as unknown as string;
    const user = await findUserByEmail(email);
    res.json({
      exists: Boolean(user),
      user: user ? { id: user.id, name: user.name, email: user.email, avatar: user.avatar, role: user.role } : null,
    });
  } catch (error) {
    logger.error('Admin organiser lookup error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/tournaments/:id/organizers — who has organiser access.
router.get('/tournaments/:id/organizers', validate({ params: AdminTournamentParams }), async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } });
    if (!tournament) { res.status(404).json({ error: 'Tournament not found' }); return; }
    const [organizers, audit] = await Promise.all([listOrganizers(tournamentId), listOrganizerAudit(tournamentId)]);
    res.json({
      organizers: organizers.map((o) => ({
        userId: o.user.id,
        name: o.user.name,
        email: o.user.email,
        avatar: o.user.avatar,
        addedBy: o.addedBy ? { id: o.addedBy.id, name: o.addedBy.name } : null,
        createdAt: o.createdAt,
      })),
      // Durable access history — grants and revokes, most recent first.
      audit: audit.map((a) => ({
        action: a.action,
        accountCreated: a.accountCreated,
        userId: a.user.id,
        userName: a.user.name,
        userEmail: a.user.email,
        actor: a.actor ? { id: a.actor.id, name: a.actor.name } : null,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    logger.error('Admin list organisers error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/tournaments/:id/organizers — add an organiser.
//   • { userId }        → existing account: assign + notify (in-app + email per prefs).
//   • { name, email }   → email already on platform: assign + notify (no new account).
//                       → email not on platform: create account, assign, email credentials.
// Idempotent: re-adding an existing organiser is a no-op, never a duplicate.
router.post(
  '/tournaments/:id/organizers',
  writeLimiter,
  validate({ params: AdminTournamentParams, body: AdminAddOrganizerBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournamentId = req.params.id as string;
      const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, name: true } });
      if (!tournament) { res.status(404).json({ error: 'Tournament not found' }); return; }

      const { userId, name, email } = req.body as { userId?: string; name?: string; email?: string };

      // Resolve whether this maps to an existing account, then let the pure planner
      // decide assign-vs-create. Crucially, the plan never carries a role for an
      // existing user, so an existing ADMIN (or anyone) cannot be downgraded here.
      let existingUserIdByEmail: string | null = null;
      if (userId) {
        const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!existing) { res.status(404).json({ error: 'User not found' }); return; }
      } else {
        const existing = await findUserByEmail(email!);
        existingUserIdByEmail = existing?.id ?? null;
      }

      const plan = planOrganizerAdd({ userId, existingUserIdByEmail });
      let targetUserId: string;
      let created = false;
      if (plan.action === 'assign-existing') {
        targetUserId = plan.targetUserId;                    // assignment only — role untouched
      } else {
        const provisioned = await provisionOrganizerAccount({ name: name!, email: email!, tournamentId, tournamentName: tournament.name });
        targetUserId = provisioned.userId;                   // brand-new ORGANIZER account
        created = true;
      }

      await assignOrganizer(tournamentId, targetUserId, req.user!.userId, { accountCreated: created });

      // Existing accounts get the in-app + email notification. New accounts already
      // received the credentials email (which names the tournament) — no double-ping.
      if (!created) {
        await notifyOrganizerAssigned(targetUserId, tournamentId, tournament.name);
      }

      logger.info('admin.organizer_added', { actorId: req.user!.userId, tournamentId, userId: targetUserId, created });
      res.status(201).json({ userId: targetUserId, created });
    } catch (error) {
      logger.error('Admin add organiser error', { error: String(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/admin/tournaments/:id/organizers/:userId — revoke access (immediate).
router.delete('/tournaments/:id/organizers/:userId', validate({ params: AdminOrganizerParams }), async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;
    const userId = req.params.userId as string;
    await revokeOrganizer(tournamentId, userId, req.user!.userId);
    logger.info('admin.organizer_revoked', { actorId: req.user!.userId, tournamentId, userId });
    res.status(204).send();
  } catch (error) {
    logger.error('Admin revoke organiser error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

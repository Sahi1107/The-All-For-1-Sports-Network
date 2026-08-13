import { Router, Response } from 'express';
import prisma from '../config/db';
import admin from '../config/firebaseAdmin';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadImage, validateImageBytes } from '../middleware/upload';
import { browseLimiter, writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { UpdateProfileBody, UserSearchQuery } from '@af1/validation';
import { uploadToGCS, signMediaDeep, signMediaDeepAll } from '../services/storage';
import { attachConnectionStatus } from '../services/connectionState';
import { deleteUserCompletely } from '../services/userDeletion';
import { buildUserExport } from '../services/dataExport';
import { recordProfileView, profileViewsSummary } from '../services/notifications/profileViews';
import { parseReportInput, createReport } from '../services/reports';
import { blockedUserIds } from '../services/blocks';
import { searchablePeopleWhere } from '../services/search/gate';
import { canSeeSocialLists, socialListUsers } from '../services/social';
import { isPubliclyViewable } from '../services/profileVisibility';
import { personSearchOr } from '../services/search/matchQuery';
import { isStatSport, careerTotalsForUsers, tournamentTotalsForUser, matchStatLinesForUser, type MatchStatLine } from '../data/careerStats';
import logger from '../utils/logger';

const router = Router();

// GET /api/users — search/filter users
router.get('/', authenticate, browseLimiter, validate({ query: UserSearchQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { role, sport, search, location, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // ONE discovery gate, shared with the /api/search typeahead
    // (searchablePeopleWhere): discoverable && !guardianManaged && role ∉
    // {ADMIN,TEAM} && not the viewer && not in a block relationship (either way).
    // Keeps privacy rules identical across every discovery surface.
    const blocked = await blockedUserIds(req.user!.userId);
    const where: any = { ...searchablePeopleWhere([req.user!.userId, ...blocked]) };
    // Optionally narrow to a specific role — but never one the gate excludes.
    if (role && role !== 'ADMIN' && role !== 'TEAM') where.role = role;
    if (sport) where.sport = sport;
    if (location) where.location = { contains: location as string, mode: 'insensitive' };
    if (search) {
      // Match everything a person would reasonably type — name, bio, position,
      // location, and sport (mapped by keyword). The gate above still applies (AND).
      const or = personSearchOr(search as string);
      if (or) where.OR = or;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, role: true, sport: true, avatar: true,
          bio: true, location: true, position: true, verified: true,
          _count: { select: { followers: true, following: true, highlights: true } },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    // Attach mutual-connection count per user (accepted connections in common with current user)
    const meId = req.user!.userId;
    const myConnRows = await prisma.connection.findMany({
      where: { status: 'ACCEPTED', OR: [{ senderId: meId }, { receiverId: meId }] },
      select: { senderId: true, receiverId: true },
    });
    const myConnIds = myConnRows.map((r) => (r.senderId === meId ? r.receiverId : r.senderId));

    // Mutual-connection counts in ONE query instead of N (was a count() per
    // result user — up to 20 round-trips). Fetch every accepted edge between a
    // result user and one of my connections, then tally per result user in JS.
    if (myConnIds.length > 0 && users.length > 0) {
      const userIds = users.map((u) => u.id);
      const userIdSet = new Set(userIds);
      const edges = await prisma.connection.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { senderId: { in: userIds }, receiverId: { in: myConnIds } },
            { receiverId: { in: userIds }, senderId: { in: myConnIds } },
          ],
        },
        select: { senderId: true, receiverId: true },
      });
      const tally = new Map<string, number>();
      for (const e of edges) {
        const uId = userIdSet.has(e.senderId) ? e.senderId : e.receiverId;
        tally.set(uId, (tally.get(uId) ?? 0) + 1);
      }
      users.forEach((u) => { (u as any).mutualCount = tally.get(u.id) ?? 0; });
    } else {
      users.forEach((u) => { (u as any).mutualCount = 0; });
    }

    await attachConnectionStatus(req.user!.userId, users as Array<{ id: string }>);
    await signMediaDeepAll(users);
    res.json({ users, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/blocked — users the current user has blocked
router.get('/blocked', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const blocks = await prisma.block.findMany({
      where: { blockerId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { select: { id: true, name: true, avatar: true, role: true, sport: true } } },
    });
    const users = blocks.map((b) => b.blocked);
    await signMediaDeepAll(users);
    res.json({ users });
  } catch (error) {
    console.error('Get blocked error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/block/:id — block another user
router.post('/block/:id', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const target = req.params.id as string;
    if (target === req.user!.userId) {
      res.status(400).json({ error: 'Cannot block yourself' });
      return;
    }
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: req.user!.userId, blockedId: target } },
      create: { blockerId: req.user!.userId, blockedId: target },
      update: {},
    });
    // Remove any follow/connection relationships in either direction
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: req.user!.userId, followingId: target },
          { followerId: target, followingId: req.user!.userId },
        ],
      },
    });
    await prisma.connection.deleteMany({
      where: {
        OR: [
          { senderId: req.user!.userId, receiverId: target },
          { senderId: target, receiverId: req.user!.userId },
        ],
      },
    });
    res.json({ blocked: true });
  } catch (error) {
    console.error('Block error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/block/:id — unblock
router.delete('/block/:id', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.block.deleteMany({
      where: { blockerId: req.user!.userId, blockedId: req.params.id as string },
    });
    res.json({ blocked: false });
  } catch (error) {
    console.error('Unblock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/report/:id — report another user
router.post('/report/:id', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const target = req.params.id as string;
    if (target === req.user!.userId) {
      res.status(400).json({ error: 'Cannot report yourself' });
      return;
    }
    const parsed = parseReportInput(req.body);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    await createReport({
      reporterId: req.user!.userId,
      reportedUserId: target,
      targetType: 'USER',
      reason: parsed.reason,
      details: parsed.details,
    });
    res.status(201).json({ reported: true });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/settings/notifications — update notification preferences
router.patch('/settings/notifications', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { messageNotifications, showOnlineStatus, messagingFollowersOnly, disableAllComments, privateProfileViews } = req.body ?? {};

    // Update the safe fields first.
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(typeof messageNotifications === 'boolean' && { messageNotifications }),
        ...(typeof showOnlineStatus === 'boolean' && { showOnlineStatus }),
        ...(typeof messagingFollowersOnly === 'boolean' && { messagingFollowersOnly }),
        ...(typeof privateProfileViews === 'boolean' && { privateProfileViews }),
      },
      select: { messageNotifications: true, showOnlineStatus: true, messagingFollowersOnly: true, privateProfileViews: true },
    });

    // Handle disableAllComments separately so a missing column in prod doesn't
    // wipe out the whole settings update.
    let disableAllCommentsValue = false;
    if (typeof disableAllComments === 'boolean') {
      try {
        const updated = await prisma.user.update({
          where: { id: req.user!.userId },
          data: { disableAllComments },
          select: { disableAllComments: true },
        });
        disableAllCommentsValue = updated.disableAllComments;
      } catch (e) {
        console.error('disableAllComments update failed (column may not exist):', e);
      }
    } else {
      try {
        const existing = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { disableAllComments: true },
        });
        disableAllCommentsValue = existing?.disableAllComments ?? false;
      } catch {
        // column missing — default false
      }
    }

    res.json({ settings: { ...user, disableAllComments: disableAllCommentsValue } });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/settings/visibility — guardian toggles a minor's discoverability.
// Restricted to guardian-managed (under-13) accounts: only the guardian, who
// operates the account, may make the minor publicly discoverable or private again.
router.patch('/settings/visibility', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { discoverable } = req.body;
    if (typeof discoverable !== 'boolean') {
      res.status(400).json({ error: 'discoverable (boolean) is required' });
      return;
    }
    const me = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { guardianManaged: true },
    });
    if (!me?.guardianManaged) {
      res.status(403).json({ error: 'Visibility is only adjustable on guardian-managed accounts' });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { discoverable },
      select: { discoverable: true },
    });
    res.json({ discoverable: updated.discoverable });
  } catch (error) {
    console.error('Update visibility error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/settings/verify-phone — confirm phone was linked in Firebase
router.post('/settings/verify-phone', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    // Look up the Firebase user and check if a phone number is linked
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { firebaseUid: true } });
    if (!user?.firebaseUid) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const fbUser = await admin.auth().getUser(user.firebaseUid);
    if (!fbUser.phoneNumber) {
      res.status(400).json({ error: 'No phone number linked to your account' });
      return;
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { phoneVerified: true, phone: fbUser.phoneNumber },
    });

    res.json({ phoneVerified: true, phone: fbUser.phoneNumber });
  } catch (error) {
    console.error('Verify phone error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me/export — DPDP "download my data": the current user's own
// data as a downloadable JSON file.
router.get('/me/export', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const data = await buildUserExport(req.user!.userId);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="allfor1-data-${stamp}.json"`);
    res.send(JSON.stringify(data, null, 2));
    logger.info('user.data_export', { userId: req.user!.userId });
  } catch (error: any) {
    if (error?.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    logger.error('Data export error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/account — current user deletes their own account
router.delete('/account', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    await deleteUserCompletely(req.user!.userId);
    logger.info('user.self_deleted', { userId: req.user!.userId });
    res.json({ message: 'Account deleted' });
  } catch (error: any) {
    if (error?.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    console.error('Self-delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id — get user profile
// GET /:id/performance-card — Performance Card data for the profile. Same
// discoverable/404 gate as GET /:id. Career stats + per-tournament "receipts"
// (stat sports), PLUS an all-sports competition record (teams → tournaments →
// match counts), rankings, endorsements, achievements — so a non-stat athlete
// still gets a full, credible card rather than an empty one.
router.get('/:id/performance-card', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const isSelf = req.user!.userId === id;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, sport: true, discoverable: true, claimStatus: true, guardianManaged: true, achievements: true, athleticsEvents: true },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    if (!isSelf && !isPubliclyViewable(user)) { res.status(404).json({ error: 'User not found' }); return; }

    const sport = user.sport;
    const statSport = isStatSport(sport);

    // ── Career totals + per-tournament receipts (stat sports only) ──
    let career: { matches: number; totals: Record<string, number>; averages: Record<string, number> } | null = null;
    let tournaments: Array<{ id: string; name: string; startDate: Date; matches: number; totals: Record<string, number>; averages: Record<string, number> }> = [];
    // Per-match detail. Tournament leaderboards show averages only, so the full
    // total and every individual match line have to be reachable somewhere —
    // that somewhere is here, on the player's own profile.
    let matchLines: MatchStatLine[] = [];
    if (statSport && sport) {
      const t = (await careerTotalsForUsers(sport, [id])).get(id);
      if (t && t.matches > 0) {
        const averages: Record<string, number> = {};
        for (const [k, v] of Object.entries(t.totals)) averages[k] = t.matches ? Math.round((v / t.matches) * 10) / 10 : 0;
        career = { matches: t.matches, totals: t.totals, averages };

        const perTourn = await tournamentTotalsForUser(sport, id);
        if (perTourn.length) {
          const tourns = await prisma.tournament.findMany({
            where: { id: { in: perTourn.map((p) => p.tournamentId) } },
            select: { id: true, name: true, startDate: true },
          });
          const byId = new Map(tourns.map((tt) => [tt.id, tt]));
          tournaments = perTourn
            .map((p) => {
              const tt = byId.get(p.tournamentId);
              if (!tt) return null;
              // Averages alongside totals so the profile can explain a leaderboard
              // figure without the reader doing the division themselves.
              const averages: Record<string, number> = {};
              for (const [k, v] of Object.entries(p.totals)) {
                averages[k] = p.matches ? Math.round((v / p.matches) * 10) / 10 : 0;
              }
              return { id: tt.id, name: tt.name, startDate: tt.startDate, matches: p.matches, totals: p.totals, averages };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
        }
        matchLines = await matchStatLinesForUser(sport, id);
      }
    }

    // ── Competition record (all sports): ACCEPTED teams → tournaments + matches ──
    const memberships = await prisma.teamMember.findMany({
      where: { userId: id, status: 'ACCEPTED' },
      select: {
        team: {
          select: {
            id: true, name: true,
            tournament: { select: { id: true, name: true, startDate: true } },
            tournamentRegistrations: { select: { tournament: { select: { id: true, name: true, startDate: true } } } },
          },
        },
      },
    });
    type Tourn = { id: string; name: string; startDate: Date };
    const pairs: Array<{ teamId: string; teamName: string; tournament: Tourn }> = [];
    const seenPair = new Set<string>();
    for (const m of memberships) {
      const team = m.team;
      if (!team) continue;
      const tourns: Tourn[] = [];
      if (team.tournament) tourns.push(team.tournament);
      for (const reg of team.tournamentRegistrations) if (reg.tournament) tourns.push(reg.tournament);
      for (const tr of tourns) {
        const key = `${team.id}:${tr.id}`;
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        pairs.push({ teamId: team.id, teamName: team.name, tournament: tr });
      }
    }
    const teamIds = [...new Set(pairs.map((p) => p.teamId))];
    const tournIds = [...new Set(pairs.map((p) => p.tournament.id))];
    let matchRows: Array<{ tournamentId: string; homeTeamId: string; awayTeamId: string }> = [];
    if (teamIds.length && tournIds.length) {
      matchRows = await prisma.match.findMany({
        where: { tournamentId: { in: tournIds }, OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] },
        select: { tournamentId: true, homeTeamId: true, awayTeamId: true },
      });
    }
    const competition = pairs
      .map((p) => ({
        tournament: p.tournament,
        team: { id: p.teamId, name: p.teamName },
        teamMatches: matchRows.filter((r) => r.tournamentId === p.tournament.id && (r.homeTeamId === p.teamId || r.awayTeamId === p.teamId)).length,
      }))
      .sort((a, b) => b.tournament.startDate.getTime() - a.tournament.startDate.getTime());

    // ── Rankings + endorsements ──
    const rankings = await prisma.playerRanking.findMany({
      where: { userId: id },
      orderBy: { calculatedAt: 'desc' }, take: 10,
      select: { rank: true, score: true, category: true, tournament: { select: { id: true, name: true } } },
    });
    const endorsementCount = await prisma.endorsement.count({ where: { athleteId: id } });

    res.json({
      sport, isStatSport: statSport,
      career, tournaments, matchLines, competition, rankings, endorsementCount,
      achievements: user.achievements ?? [],
      athleticsEvents: user.athleticsEvents ?? [],
    });
  } catch (error) {
    console.error('Get performance card error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isSelf = req.user!.userId === req.params.id as string;

    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true, name: true, role: true, sport: true, gender: true, avatar: true,
        bio: true, location: true, age: true, height: true, position: true,
        achievements: true, verified: true, createdAt: true,
        contactEmail: true, banner: true, guardianManaged: true, discoverable: true,
        // Drives both the visibility gate below and the "unclaimed profile" notice
        // the client shows on the page.
        claimStatus: true,
        // Email, phone, DOB, and notification settings are private
        ...(isSelf && { email: true, phone: true, phoneVerified: true, dateOfBirth: true, handoverStatus: true, messageNotifications: true, showOnlineStatus: true, messagingFollowersOnly: true, privateProfileViews: true }),
        highlights: { orderBy: { createdAt: 'desc' }, take: 10 },
        teamMemberships: { include: { team: true } },
        playerRankings: { orderBy: { calculatedAt: 'desc' }, take: 5, include: { tournament: { select: { id: true, name: true } } } },
        _count: { select: { followers: true, following: true, highlights: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // A private (undiscoverable) profile — under-13 accounts by default — is only
    // viewable by the account holder (the guardian). 404 rather than 403 so we
    // don't confirm the account exists to outsiders. An UNCLAIMED profile is the
    // documented exception: not discoverable, but its page must open, because it
    // is linked from rosters, box scores and the ranking boards.
    if (!isSelf && !isPubliclyViewable(user)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // A block in EITHER direction hides the profile entirely (404, not 403, so we
    // don't confirm the account exists). The blocked party must not be able to
    // retrieve it; the blocker manages/undoes the block from Settings, not here.
    if (!isSelf) {
      const block = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: req.user!.userId, blockedId: req.params.id as string },
            { blockerId: req.params.id as string, blockedId: req.user!.userId },
          ],
        },
        select: { id: true },
      });
      if (block) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
    }

    // Fetch disableAllComments separately so a missing column (pre `prisma db push`)
    // doesn't break the entire self-profile endpoint.
    if (isSelf) {
      try {
        const extra = await prisma.user.findUnique({
          where: { id: req.params.id as string },
          select: { disableAllComments: true },
        });
        (user as any).disableAllComments = extra?.disableAllComments ?? false;
      } catch {
        (user as any).disableAllComments = false;
      }
      // Owner-only "who's watching" summary — anonymised counts + roles, never
      // viewer identities. Only athletes accrue views. Never breaks the profile.
      if (user.role === 'ATHLETE') {
        (user as any).profileViews = await profileViewsSummary(user.id).catch(() => null);
      }
    }

    // Check if current user follows/is connected to / has blocked this user, and
    // the profile user's TOTAL accepted-connection count. Connections (mutual) are
    // a separate system from followers/following (one-directional) and get their
    // own count — the union of accepted edges in either direction.
    const [isFollowing, connection, blockRow, connectionCount] = await Promise.all([
      prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: req.user!.userId, followingId: req.params.id as string } },
      }),
      prisma.connection.findFirst({
        where: {
          OR: [
            { senderId: req.user!.userId, receiverId: req.params.id as string },
            { senderId: req.params.id as string, receiverId: req.user!.userId },
          ],
        },
      }),
      isSelf ? Promise.resolve(null) : prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: req.user!.userId, blockedId: req.params.id as string } },
      }),
      prisma.connection.count({
        where: {
          status: 'ACCEPTED',
          OR: [{ senderId: req.params.id as string }, { receiverId: req.params.id as string }],
        },
      }),
    ]);
    // Expose it alongside followers/following so the profile can render all three
    // counts from one payload (kept out of the Prisma _count select because that
    // can't filter by status across the two sender/receiver relations).
    (user as any)._count.connections = connectionCount;

    // Contact email is connection-gated and adult-only. Returned to the owner, or
    // to an ACCEPTED connection when the target is a known adult (age >= 18). Fail
    // closed: never exposed for a minor or unknown age, even to a connection.
    const contactEmailAllowed =
      isSelf ||
      (connection?.status === 'ACCEPTED' && typeof user.age === 'number' && user.age >= 18);
    if (!contactEmailAllowed) {
      delete (user as { contactEmail?: string | null }).contactEmail;
    }

    await signMediaDeep(user);
    res.json({ user, isFollowing: !!isFollowing, connection, isBlocked: !!blockRow });

    // Fire-and-forget: record the view + (for scouts/coaches) notify the athlete.
    if (!isSelf && !blockRow) {
      void recordProfileView(
        { id: req.user!.userId, role: req.user!.role },
        { id: user.id, role: user.role, discoverable: user.discoverable, guardianManaged: user.guardianManaged },
      );
    }
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/followers — followers list, connection-gated + safety-filtered.
// Access: owner or an accepted connection only (else 403, counts stay visible).
// Contents: discovery-gated + block-filtered so a guardian-managed / non-discoverable
// account is never revealed. See services/social.ts.
router.get('/:id/followers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const me = req.user!.userId;
    const targetId = req.params.id as string;
    if (!(await canSeeSocialLists(me, targetId))) {
      res.status(403).json({ error: 'Only connections can view this list', gated: true });
      return;
    }
    const users = await socialListUsers('followers', targetId, me);
    await signMediaDeepAll(users);
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/following — same access + safety rules as /followers.
router.get('/:id/following', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const me = req.user!.userId;
    const targetId = req.params.id as string;
    if (!(await canSeeSocialLists(me, targetId))) {
      res.status(403).json({ error: 'Only connections can view this list', gated: true });
      return;
    }
    const users = await socialListUsers('following', targetId, me);
    await signMediaDeepAll(users);
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: upload an avatar buffer to GCS and return its object key.
// Note: GCS does not perform server-side image transforms; the previous
// 400x400 fill was a Cloudinary feature. The frontend already crops avatars
// at display time, so we store the original.
async function uploadAvatar(file: Express.Multer.File): Promise<string> {
  const ext = (file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
  return uploadToGCS(file.buffer, 'avatars', ext, file.mimetype);
}

// PUT /api/users/profile — update own profile
router.put('/profile', authenticate, writeLimiter, uploadImage.single('avatar'), validate({ body: UpdateProfileBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { name, bio, location, age, height, position, gender, achievements, phone, contactEmail } = req.body;

    // achievements is a String[] column; the client sends it as a JSON array
    // string. Parse + sanitise (trim, drop empties, cap count/length). A
    // malformed value leaves it undefined so we never wipe existing data.
    let achievementsArr: string[] | undefined;
    if (typeof achievements === 'string' && achievements.trim() !== '') {
      try {
        const parsed = JSON.parse(achievements);
        if (Array.isArray(parsed)) {
          achievementsArr = parsed.map((x) => String(x).trim()).filter((x) => x.length > 0).slice(0, 50).map((x) => x.slice(0, 200));
        }
      } catch { /* malformed — ignore */ }
    }

    let avatarUrl: string | undefined;
    if (req.file) {
      if (!validateImageBytes(req.file, res)) return;
      avatarUrl = await uploadAvatar(req.file);
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
        ...(location !== undefined && { location }),
        ...(age !== undefined && { age: parseInt(age) }),
        ...(height !== undefined && { height }),
        ...(position !== undefined && { position }),
        ...(gender !== undefined && { gender }),
        ...(achievementsArr !== undefined && { achievements: achievementsArr }),
        ...(phone !== undefined && { phone }),
        ...(contactEmail !== undefined && { contactEmail }),
        ...(avatarUrl !== undefined && { avatar: avatarUrl }),
      },
      select: {
        id: true, email: true, name: true, role: true, sport: true, gender: true, avatar: true,
        bio: true, location: true, age: true, height: true, position: true,
        achievements: true, verified: true, createdAt: true,
        phone: true, contactEmail: true, banner: true,
      },
    });

    await signMediaDeep(user);
    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/profile/banner — upload/replace banner image
router.put('/profile/banner', authenticate, writeLimiter, uploadImage.single('banner'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Banner image is required' });
      return;
    }
    if (!validateImageBytes(req.file, res)) return;
    const ext = (req.file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
    const key = await uploadToGCS(req.file.buffer, 'banners', ext, req.file.mimetype);
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { banner: key },
      select: { banner: true },
    });
    await signMediaDeep(user);
    res.json({ banner: user.banner });
  } catch (error) {
    console.error('Upload banner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

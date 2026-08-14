import prisma from '../config/db';
import { Role, Sport, TournamentStatus } from '@prisma/client';

// The admin "pulse": one glanceable snapshot of the platform, built from cheap
// aggregate queries (count / groupBy + one raw daily roll-up), run in parallel and
// cached briefly. Admin-only; not per-viewer, so a single process-wide cache is fine.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // platform is India-first — "today" is IST
const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

function istStartOfToday(): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}

export interface ActivityItem {
  type: 'signup' | 'post' | 'team_join' | 'match_published' | 'connection';
  at: string;
  actorName: string;
  actorAvatar: string | null;
  actorRole: string | null;
  detail: string;
}

export interface AdminOverview {
  generatedAt: string;
  signups: { today: number; week: number; month: number; trendPct: number | null; spark: number[] };
  users: {
    total: number; realPeople: number; shells: number;
    byRole: Record<string, number>;
    realAthletes: number;
  };
  tournaments: {
    total: number; byStatus: Record<string, number>;
    matchesTracked: number; matchesPublished: number; verifiedAthletes: number;
  };
  engagement: {
    posts: { total: number; week: number };
    connections: { total: number; week: number };
    profileViews: { total: number; week: number };
    radarSearches: { total: number; week: number };
  };
  bySport: Record<string, number>;
  activity: ActivityItem[];
}

async function compute(): Promise<AdminOverview> {
  const todayStart = istStartOfToday();
  const w = ago(7 * DAY_MS);
  const m = ago(30 * DAY_MS);
  const prevW = ago(14 * DAY_MS);

  const [
    spark, signupsToday, signupsWeek, signupsMonth, signupsPrevWeek,
    byRoleRows, shells, verifiedAthletes,
    tournamentsTotal, tournamentStatusRows, matchesTracked, matchesPublished,
    postsTotal, postsWeek, connTotal, connWeek, viewsTotal, viewsWeek, radarTotal, radarWeek,
    bySportRows,
    recentSignups, recentPosts, recentJoins, recentPublished, recentConnections,
  ] = await Promise.all([
    prisma.$queryRaw<{ day: Date; n: number }[]>`
      SELECT (date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata'))::date AS day, count(*)::int AS n
      FROM "User" WHERE "createdAt" >= ${m} AND "claim_status" IS NULL
      GROUP BY day ORDER BY day`,
    prisma.user.count({ where: { claimStatus: null, createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { claimStatus: null, createdAt: { gte: w } } }),
    prisma.user.count({ where: { claimStatus: null, createdAt: { gte: m } } }),
    prisma.user.count({ where: { claimStatus: null, createdAt: { gte: prevW, lt: w } } }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { claimStatus: 'UNCLAIMED' } }),
    prisma.user.count({ where: { verified: true } }),
    prisma.tournament.count(),
    prisma.tournament.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.trackerMatch.count(),
    prisma.match.count({ where: { status: 'COMPLETED' } }),
    prisma.post.count(),
    prisma.post.count({ where: { createdAt: { gte: w } } }),
    prisma.connection.count({ where: { status: 'ACCEPTED' } }),
    prisma.connection.count({ where: { status: 'ACCEPTED', updatedAt: { gte: w } } }),
    prisma.profileView.count(),
    prisma.profileView.count({ where: { createdAt: { gte: w } } }),
    prisma.radarSearch.count(),
    prisma.radarSearch.count({ where: { createdAt: { gte: w } } }),
    prisma.user.groupBy({ by: ['sport'], where: { sport: { not: null } }, _count: { _all: true } }),
    prisma.user.findMany({ where: { claimStatus: null }, orderBy: { createdAt: 'desc' }, take: 8, select: { name: true, avatar: true, role: true, createdAt: true } }),
    prisma.post.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { createdAt: true, user: { select: { name: true, avatar: true, role: true } } } }),
    prisma.teamMember.findMany({ where: { status: 'ACCEPTED' }, orderBy: { joinedAt: 'desc' }, take: 8, select: { joinedAt: true, user: { select: { name: true, avatar: true, role: true } }, team: { select: { name: true } } } }),
    prisma.match.findMany({ where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 8, select: { createdAt: true, tournament: { select: { name: true } }, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } } }),
    prisma.connection.findMany({ where: { status: 'ACCEPTED' }, orderBy: { updatedAt: 'desc' }, take: 8, select: { updatedAt: true, sender: { select: { name: true, avatar: true, role: true } }, receiver: { select: { name: true, avatar: true, role: true } } } }),
  ]);

  // Signup sparkline: 30 IST days, zero-filled.
  const sparkMap = new Map(spark.map((r) => [new Date(r.day).toISOString().slice(0, 10), Number(r.n)]));
  const sparkArr: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() + IST_OFFSET_MS - i * DAY_MS).toISOString().slice(0, 10);
    sparkArr.push(sparkMap.get(d) ?? 0);
  }
  const trendPct = signupsPrevWeek > 0
    ? Math.round(((signupsWeek - signupsPrevWeek) / signupsPrevWeek) * 100)
    : (signupsWeek > 0 ? 100 : null);

  const byRole: Record<string, number> = Object.fromEntries(Object.values(Role).map((r) => [r, 0]));
  let total = 0;
  for (const row of byRoleRows) { byRole[row.role] = row._count._all; total += row._count._all; }
  const realAthletes = Math.max(0, (byRole[Role.ATHLETE] ?? 0) - shells);

  const byStatus: Record<string, number> = Object.fromEntries(Object.values(TournamentStatus).map((s) => [s, 0]));
  for (const row of tournamentStatusRows) byStatus[row.status] = row._count._all;

  const bySport: Record<string, number> = Object.fromEntries(Object.values(Sport).map((s) => [s, 0]));
  for (const row of bySportRows) if (row.sport) bySport[row.sport] = row._count._all;

  const nm = (u: { name: string } | null | undefined) => u?.name ?? 'Someone';
  const activity: ActivityItem[] = [
    ...recentSignups.map((u) => ({ type: 'signup' as const, at: u.createdAt.toISOString(), actorName: u.name, actorAvatar: u.avatar, actorRole: u.role, detail: 'joined All For 1' })),
    ...recentPosts.map((p) => ({ type: 'post' as const, at: p.createdAt.toISOString(), actorName: nm(p.user), actorAvatar: p.user?.avatar ?? null, actorRole: p.user?.role ?? null, detail: 'posted' })),
    ...recentJoins.map((tm) => ({ type: 'team_join' as const, at: tm.joinedAt.toISOString(), actorName: nm(tm.user), actorAvatar: tm.user?.avatar ?? null, actorRole: tm.user?.role ?? null, detail: `joined ${tm.team?.name ?? 'a team'}` })),
    ...recentPublished.map((mt) => ({ type: 'match_published' as const, at: mt.createdAt.toISOString(), actorName: mt.tournament?.name ?? 'A tournament', actorAvatar: null, actorRole: null, detail: `result published — ${mt.homeTeam?.name ?? 'Home'} vs ${mt.awayTeam?.name ?? 'Away'}` })),
    ...recentConnections.map((c) => ({ type: 'connection' as const, at: c.updatedAt.toISOString(), actorName: nm(c.sender), actorAvatar: c.sender?.avatar ?? null, actorRole: c.sender?.role ?? null, detail: `connected with ${nm(c.receiver)}` })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    signups: { today: signupsToday, week: signupsWeek, month: signupsMonth, trendPct, spark: sparkArr },
    users: { total, realPeople: Math.max(0, total - shells), shells, byRole, realAthletes },
    tournaments: { total: tournamentsTotal, byStatus, matchesTracked, matchesPublished, verifiedAthletes },
    engagement: {
      posts: { total: postsTotal, week: postsWeek },
      connections: { total: connTotal, week: connWeek },
      profileViews: { total: viewsTotal, week: viewsWeek },
      radarSearches: { total: radarTotal, week: radarWeek },
    },
    bySport,
    activity,
  };
}

// ── Short TTL cache + single-flight (admin traffic is tiny, but auto-refresh +
//    multiple admins shouldn't re-run ~26 aggregates every few seconds). ──
const TTL_MS = 20_000;
let cache: { data: AdminOverview; expires: number } | null = null;
let inflight: Promise<AdminOverview> | null = null;

export async function getAdminOverview(force = false): Promise<AdminOverview> {
  if (!force && cache && Date.now() <= cache.expires) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await compute();
      cache = { data, expires: Date.now() + TTL_MS };
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

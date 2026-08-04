import prisma from '../../config/db';
import { notify } from './notify';

const SCOUT_ROLES = new Set(['SCOUT', 'COACH', 'AGENT', 'TEAM']);
const ROLE_LABEL: Record<string, string> = { SCOUT: 'scout', COACH: 'coach', AGENT: 'agent', TEAM: 'club' };

export interface Viewer { id: string; role: string }
export interface Target { id: string; role: string; discoverable?: boolean | null; guardianManaged?: boolean | null }

/** Pure: is this a view we track at all? (adult, discoverable athlete; not self). */
export function qualifiesForViewTracking(viewerId: string, target: Target): boolean {
  return viewerId !== target.id
    && target.role === 'ATHLETE'
    && target.discoverable !== false
    && !target.guardianManaged;
}

/** Pure: should the athlete be notified of this view? (scout/coach, first today). */
export function shouldNotifyScoutView(viewerRole: string, firstToday: boolean): boolean {
  return firstToday && SCOUT_ROLES.has(viewerRole);
}

/** Pure: does this viewer leave a trace, or are they browsing privately? */
export function viewerLeavesTrace(privateProfileViews: boolean | null | undefined): boolean {
  return !privateProfileViews;
}

/**
 * Record a profile view (one row per viewer/target/day) and — the first time a
 * scout/coach views a discoverable adult athlete on a given day — fire a
 * privacy-preserving "a scout viewed your profile" notification.
 *
 * Privacy by design: we pass actorId (for block-check + collapse) but the
 * in-app API never exposes the viewer's identity for this type — the athlete
 * sees the ROLE ("a scout"), collapsed to "N scouts and coaches", not who.
 * Under-13 (guardian-managed) and private profiles are skipped entirely.
 * Fire-and-forget: never blocks or breaks profile loading.
 */
export async function recordProfileView(viewer: Viewer, target: Target): Promise<void> {
  try {
    if (!qualifiesForViewTracking(viewer.id, target)) return;

    // Respect the viewer's private-browsing choice — leave no trace at all.
    const v = await prisma.user.findUnique({
      where: { id: viewer.id }, select: { privateProfileViews: true },
    }).catch(() => null);
    if (!viewerLeavesTrace(v?.privateProfileViews)) return;

    const day = new Date().toISOString().slice(0, 10);
    let firstToday = false;
    try {
      await prisma.profileView.create({ data: { viewerId: viewer.id, targetId: target.id, day } });
      firstToday = true;
    } catch {
      firstToday = false; // unique(viewer,target,day) violation → already counted today
    }

    if (shouldNotifyScoutView(viewer.role, firstToday)) {
      await notify({
        recipientId: target.id,
        type: 'PROFILE_VIEW',
        actorId: viewer.id, // block-check + collapse only; identity never surfaced
        ctx: { extra: ROLE_LABEL[viewer.role] ?? 'scout' },
        link: `/profile/${target.id}`,
      });
    }
  } catch {
    /* analytics/notification must never break profile loading */
  }
}

export interface ProfileViewsSummary {
  total7: number;               // all views in the last 7 days
  prev7: number;                // the 7 days before that (for the trend)
  deltaPct: number | null;      // % change vs prev week; null when no baseline
  notable7: number;             // scouts/coaches/agents/clubs this week
  byRole: { scout: number; coach: number; agent: number; team: number };
  daily: number[];              // 7 daily counts, oldest → today (sparkline)
}

/**
 * Anonymised profile-views summary for the profile OWNER — the "someone is
 * watching" moment. Counts and roles only: viewer identities are never returned
 * (same rule as the notification). Private-browsing viewers were never recorded,
 * so they're already excluded. Never throws — returns zeros on any failure.
 */
export async function profileViewsSummary(targetId: string): Promise<ProfileViewsSummary> {
  const empty: ProfileViewsSummary = {
    total7: 0, prev7: 0, deltaPct: null, notable7: 0,
    byRole: { scout: 0, coach: 0, agent: 0, team: 0 }, daily: [0, 0, 0, 0, 0, 0, 0],
  };
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  try {
    const rows = await prisma.profileView.findMany({
      where: { targetId, createdAt: { gte: new Date(now - 14 * DAY) } },
      select: { createdAt: true, viewer: { select: { role: true } } },
    });
    const s = { ...empty, byRole: { ...empty.byRole }, daily: [0, 0, 0, 0, 0, 0, 0] };
    for (const r of rows) {
      const ageDays = (now - r.createdAt.getTime()) / DAY;
      if (ageDays < 7) {
        s.total7++;
        const idx = 6 - Math.floor(ageDays); // 0 = 6 days ago … 6 = today
        if (idx >= 0 && idx < 7) s.daily[idx]++;
        const role = r.viewer?.role;
        if (role === 'SCOUT') s.byRole.scout++;
        else if (role === 'COACH') s.byRole.coach++;
        else if (role === 'AGENT') s.byRole.agent++;
        else if (role === 'TEAM') s.byRole.team++;
      } else if (ageDays < 14) {
        s.prev7++;
      }
    }
    s.notable7 = s.byRole.scout + s.byRole.coach + s.byRole.agent + s.byRole.team;
    s.deltaPct = s.prev7 === 0 ? null : Math.round(((s.total7 - s.prev7) / s.prev7) * 100);
    return s;
  } catch {
    return empty;
  }
}

/** Distinct scout/coach viewer-days for a user over the last `days` days. */
export async function profileViewCount(targetId: string, days = 7): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    return await prisma.profileView.count({ where: { targetId, createdAt: { gte: since } } });
  } catch {
    return 0;
  }
}

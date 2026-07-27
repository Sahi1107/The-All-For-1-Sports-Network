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

/** Distinct scout/coach viewer-days for a user over the last `days` days. */
export async function profileViewCount(targetId: string, days = 7): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    return await prisma.profileView.count({ where: { targetId, createdAt: { gte: since } } });
  } catch {
    return 0;
  }
}

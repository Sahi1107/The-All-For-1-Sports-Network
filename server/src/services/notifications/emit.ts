import { notify } from './notify';

// ─────────────────────────────────────────────────────────────────────────────
// Typed convenience wrappers for the high-value notification types. Each is a
// one-liner over notify() so wiring a trigger is trivial and copy stays in the
// catalog. The comment on each says exactly where it should be called from.
// PROFILE_VIEW is wired (see profileViews.ts + user.routes GET /:id). The rest
// are ready — call them from the noted trigger.
// ─────────────────────────────────────────────────────────────────────────────

/** Call when an athlete's stats are verified / Performance Card recomputed.
 *  Trigger: the stats-verification / card-update path (admin verify or stat write). */
export function notifyStatsVerified(athleteId: string, summary?: string, link?: string) {
  return notify({ recipientId: athleteId, type: 'STATS_VERIFIED', ctx: { extra: summary }, link });
}

/** Call when a match result + player stats are published.
 *  Trigger: tournament/tracker match publish (per participating athlete). */
export function notifyMatchResult(athleteId: string, matchLabel: string, statLine?: string, link?: string) {
  return notify({ recipientId: athleteId, type: 'MATCH_RESULT_PUBLISHED', ctx: { entityName: matchLabel, extra: statLine }, referenceId: link, link });
}

/** Call when a player crosses a ranking threshold (entered top-N / new #1).
 *  Trigger: ranking recompute, only on a meaningful crossing (not every delta). */
export function notifyRankingMilestone(userId: string, text: string, link = '/rankings') {
  return notify({ recipientId: userId, type: 'RANKING_MILESTONE', ctx: { extra: text }, link });
}

/** Call shortly before a scheduled match (reminder).
 *  Trigger: a scheduled sweep (cron) over upcoming fixtures. */
export function notifyMatchStartingSoon(userId: string, matchLabel: string, when?: string, link?: string) {
  return notify({ recipientId: userId, type: 'MATCH_STARTING_SOON', ctx: { entityName: matchLabel, extra: when }, link });
}

/** Call when registration opens for a tournament the user is eligible for.
 *  Trigger: tournament status → REGISTRATION_OPEN, fanned to eligible users
 *  (match sport + gender + age band; keep it tight or it's spam). */
export function notifyRegistrationOpen(userId: string, tournamentName: string, link?: string) {
  return notify({ recipientId: userId, type: 'REGISTRATION_OPEN', ctx: { entityName: tournamentName }, link });
}

/** Call when registration is about to close. Trigger: scheduled sweep. */
export function notifyRegistrationClosing(userId: string, tournamentName: string, when?: string, link?: string) {
  return notify({ recipientId: userId, type: 'REGISTRATION_CLOSING', ctx: { entityName: tournamentName, extra: when }, link });
}

/** Call when a tournament draw/bracket is published.
 *  Trigger: tracker draw generation (fan to every participating team's members). */
export function notifyDrawPublished(userId: string, tournamentName: string, nextMatch?: string, link?: string) {
  return notify({ recipientId: userId, type: 'DRAW_PUBLISHED', ctx: { entityName: tournamentName, extra: nextMatch }, link });
}

/** Call when fixtures are scheduled. Trigger: the schedule endpoint
 *  (tracker sessions/:id/schedule), fanned to affected team members. */
export function notifyFixturesScheduled(userId: string, name: string, nextMatch?: string, link?: string) {
  return notify({ recipientId: userId, type: 'FIXTURES_SCHEDULED', ctx: { entityName: name, extra: nextMatch }, link });
}

/** Call when an athlete matching a scout's interests joins.
 *  Trigger: onboarding completion → match against scouts' saved interests.
 *  Default email OFF (spam risk); keep matching tight (exact sport + location). */
export function notifyNewAthleteMatch(scoutId: string, athleteName: string, sportInfo?: string, link?: string) {
  return notify({ recipientId: scoutId, type: 'NEW_ATHLETE_MATCH', ctx: { actorName: athleteName, extra: sportInfo }, link });
}

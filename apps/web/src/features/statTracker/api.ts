import api from '../../api/client';
import type { TrackerEvent, EventDraft } from '@af1/core';
import type {
  TrackerSession,
  TrackerMatch,
  TrackerFormat,
  TrackerConfig,
  TrackerMatchStatus,
  FootballState,
  BasketballState,
  RosterTeam,
} from './types';

export async function getSession(tournamentId: string): Promise<TrackerSession | null> {
  const { data } = await api.get(`/tracker/sessions/${tournamentId}`);
  return data.session ?? null;
}

export async function createSession(body: {
  tournamentId: string;
  format: TrackerFormat;
  config?: TrackerConfig;
}): Promise<TrackerSession> {
  const { data } = await api.post('/tracker/sessions', body);
  return data.session;
}

export async function getMatch(
  matchId: string,
): Promise<{ match: TrackerMatch; session: TrackerSession }> {
  const { data } = await api.get(`/tracker/matches/${matchId}`);
  return data;
}

export async function patchMatch(
  matchId: string,
  body: {
    state?: FootballState | BasketballState;
    homeScore?: number;
    awayScore?: number;
    status?: TrackerMatchStatus;
  },
): Promise<TrackerMatch> {
  const { data } = await api.patch(`/tracker/matches/${matchId}`, body);
  return data.match;
}

/** Save jersey numbers onto the session roster. Returns the updated roster so
 *  the caller can reflect it without a refetch. Rejects (400) on a duplicate
 *  number within a team. */
export async function saveJerseyNumbers(
  tournamentId: string,
  numbers: { userId: string; number: number | null }[],
): Promise<RosterTeam[]> {
  const { data } = await api.patch(`/tracker/sessions/${tournamentId}/jerseys`, { numbers });
  return data.roster;
}

export async function publishMatch(matchId: string): Promise<{ matchId: string; playerCount: number }> {
  const { data } = await api.post(`/tracker/matches/${matchId}/publish`);
  return data;
}

// ─── Live event log (basketball) ─────────────────────────────

/** The whole log on open, or just the tail after a reconnect. */
export async function getTrackerEvents(
  matchId: string,
  since?: number,
): Promise<TrackerEvent[]> {
  const { data } = await api.get(`/tracker/matches/${matchId}/events`, {
    params: since ? { since } : undefined,
  });
  return data.events;
}

export async function appendTrackerEvent(
  matchId: string,
  draft: EventDraft,
): Promise<{ event: TrackerEvent; homeScore?: number; awayScore?: number }> {
  const { data } = await api.post(`/tracker/matches/${matchId}/events`, draft);
  return data;
}

/** Remove a wrong entry. Soft on the server — the row survives for audit. */
export async function removeTrackerEvent(
  matchId: string,
  eventId: string,
): Promise<{ eventId: string; homeScore: number; awayScore: number }> {
  const { data } = await api.delete(`/tracker/matches/${matchId}/events/${eventId}`);
  return data;
}

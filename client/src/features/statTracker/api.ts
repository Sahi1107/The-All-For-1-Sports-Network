import api from '../../api/client';
import type {
  TrackerSession,
  TrackerMatch,
  TrackerFormat,
  TrackerConfig,
  TrackerMatchStatus,
  FootballState,
  BasketballState,
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

export async function publishMatch(matchId: string): Promise<{ matchId: string; playerCount: number }> {
  const { data } = await api.post(`/tracker/matches/${matchId}/publish`);
  return data;
}

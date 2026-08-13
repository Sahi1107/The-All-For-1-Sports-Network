import { useCallback, useMemo, useRef, useState } from 'react';
import { computeScores } from '../useTrackerMatch';
import { buildSession, applyResult, progress } from '../engine';
import { buildDemoTeams, simulatedResult } from './demoData';
import { DONE, stageSort } from '../components/helpers';
import type { useTrackerMatch, JerseyEdit } from '../useTrackerMatch';
import type {
  TrackerSession, TrackerMatch, TrackerFormat, TrackerConfig, TrackerSport,
  TrackerMatchStatus, FootballState, BasketballState, RosterTeam,
} from '../types';

type AnyState = FootballState | BasketballState;
type Ctrl = ReturnType<typeof useTrackerMatch>;

/** In-memory tournament controller for the demo sandbox. Owns the whole session,
 *  runs progression via engine.ts, and exposes a per-match `ctrl` (same shape as
 *  useTrackerMatch) so the real football/basketball trackers can be reused. */
export function useDemoTournament(sport: TrackerSport) {
  const [session, setSession] = useState<TrackerSession | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [liveMatch, setLiveMatch] = useState<TrackerMatch | null>(null);
  // Latest live match, readable synchronously when the match ends.
  const liveRef = useRef<TrackerMatch | null>(null);
  const appliedRef = useRef<string | null>(null);

  const roster = useMemo(() => buildDemoTeams(sport), [sport]);

  const createSession = useCallback(
    (format: TrackerFormat, config: TrackerConfig) => {
      setSession(progress(buildSession({ tournamentId: 'demo', sport, format, roster, config })));
    },
    [sport, roster],
  );

  const reset = useCallback(() => {
    setSession(null);
    setOpenId(null);
    setLiveMatch(null);
    appliedRef.current = null;
  }, []);

  // ── Simulation ────────────────────────────────────────────
  const quickSim = useCallback((m: TrackerMatch) => {
    setSession((s) => (s ? applyResult(s, m.id, simulatedResult(s, m)) : s));
  }, []);

  /** Sim every playable, unfinished match in the earliest incomplete stage. */
  const simAll = useCallback(() => {
    setSession((s) => {
      if (!s) return s;
      const playable = s.matches.filter((m) => m.homeTeamId && m.awayTeamId && !DONE(m));
      if (!playable.length) return s;
      const targetStage = [...playable].sort(
        (a, b) => stageSort(a.stage, b.stage) || a.orderIndex - b.orderIndex,
      )[0].stage;
      let next = s;
      for (const m of playable.filter((m) => m.stage === targetStage)) {
        next = applyResult(next, m.id, simulatedResult(next, m));
      }
      return next;
    });
  }, []);

  // ── Live tracking of a single fixture ─────────────────────
  const openMatch = useCallback((m: TrackerMatch) => {
    appliedRef.current = null;
    // Fresh working copy; live tracking rebuilds state from scratch.
    const fresh: TrackerMatch = { ...m, state: null, status: 'SCHEDULED', homeScore: 0, awayScore: 0 };
    liveRef.current = fresh;
    setLiveMatch(fresh);
    setOpenId(m.id);
  }, []);

  const closeMatch = useCallback(() => {
    setOpenId(null);
    setLiveMatch(null);
    liveRef.current = null;
  }, []);

  const updateState = useCallback(
    (producer: (state: AnyState) => AnyState) => {
      setLiveMatch((prev) => {
        if (!prev) return prev;
        const newState = producer(prev.state as AnyState);
        const { homeScore, awayScore } = computeScores(prev, sport, newState);
        const next = { ...prev, state: newState, homeScore, awayScore };
        liveRef.current = next;
        return next;
      });
    },
    [sport],
  );

  // Ending the match folds its result into the tournament (once) and advances it.
  const setStatus = useCallback(async (status: TrackerMatchStatus) => {
    setLiveMatch((prev) => {
      const next = prev ? { ...prev, status } : prev;
      liveRef.current = next;
      return next;
    });
    const done = liveRef.current;
    if (status === 'COMPLETED' && done && appliedRef.current !== done.id) {
      appliedRef.current = done.id;
      setSession((s) =>
        s ? applyResult(s, done.id, { homeScore: done.homeScore, awayScore: done.awayScore, state: done.state }) : s,
      );
    }
  }, []);

  // The demo is client-only (tournamentId is the literal 'demo'), so jersey
  // numbers are applied to the in-memory roster. Hitting the real endpoint
  // would 400 on the non-UUID id and put a network error in a sandbox.
  const saveJerseys = useCallback(async (numbers: JerseyEdit[]): Promise<RosterTeam[]> => {
    const incoming = new Map(numbers.map((n) => [n.userId, n.number]));
    const roster = (session?.roster ?? []).map((t) => ({
      ...t,
      players: t.players.map((p) => (
        incoming.has(p.userId) ? { ...p, number: incoming.get(p.userId) ?? null } : p
      )),
    }));
    setSession((s) => (s ? { ...s, roster } : s));
    return roster;
  }, [session]);

  const matchCtrl: Ctrl | null =
    openId && liveMatch
      ? {
          match: liveMatch,
          session,
          loading: false,
          loadError: null, // demo never fails to load — it's fully client-side
          saveState: 'saved', // demo is client-only — nothing to persist
          // Keeps the basketball tracker's event log in memory. These ids exist
          // nowhere but this browser tab, so appending them to the real endpoint
          // would only produce rejections and a false "not saved" warning.
          local: true,
          updateState,
          setStatus,
          flush: async () => {},
          setMatch: setLiveMatch,
          setSession,
          saveJerseys,
        }
      : null;

  return { session, roster, createSession, reset, quickSim, simAll, openMatch, closeMatch, openId, matchCtrl };
}

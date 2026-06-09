import { useCallback, useState } from 'react';
import { computeScores } from '../useTrackerMatch';
import { buildDemoSession } from './demoData';
import type {
  TrackerMatch, TrackerMatchStatus, TrackerSport,
  FootballState, BasketballState,
} from '../types';

type AnyState = FootballState | BasketballState;

/** Drop-in, network-free replacement for useTrackerMatch used by the demo
 *  sandbox. Same return shape so the football/basketball components are reused
 *  verbatim, but all state lives in memory and is never sent to the server. */
export function useDemoMatch(sport: TrackerSport) {
  const [{ session }] = useState(() => buildDemoSession(sport));
  const [match, setMatch] = useState<TrackerMatch | null>(() => session.matches[0]);

  const updateState = useCallback(
    (producer: (state: AnyState) => AnyState) => {
      setMatch((prev) => {
        if (!prev) return prev;
        const newState = producer(prev.state as AnyState);
        const { homeScore, awayScore } = computeScores(prev, sport, newState);
        return { ...prev, state: newState, homeScore, awayScore };
      });
    },
    [sport],
  );

  const setStatus = useCallback(async (status: TrackerMatchStatus) => {
    setMatch((prev) => (prev ? { ...prev, status } : prev));
  }, []);

  const flush = useCallback(async () => {}, []);

  return { match, session, loading: false, saving: false, updateState, setStatus, flush, setMatch };
}

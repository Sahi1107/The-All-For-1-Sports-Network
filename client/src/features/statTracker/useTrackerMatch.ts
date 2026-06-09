import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { auth } from '../../config/firebase';
import { getMatch, patchMatch } from './api';
import type {
  TrackerMatch,
  TrackerSession,
  TrackerMatchStatus,
  FootballState,
  BasketballState,
} from './types';

type AnyState = FootballState | BasketballState;

/** Sum scores from live state so the dashboard/score header stay consistent. */
export function computeScores(
  match: Pick<TrackerMatch, 'homeTeamId' | 'awayTeamId'>,
  sport: 'FOOTBALL' | 'BASKETBALL',
  state: AnyState | null,
): { homeScore: number; awayScore: number } {
  if (!state) return { homeScore: 0, awayScore: 0 };
  if (sport === 'FOOTBALL') {
    const s = state as FootballState;
    let home = 0, away = 0;
    for (const e of s.events) {
      if (e.type !== 'goal') continue;
      if (e.teamId === match.homeTeamId) home++;
      else if (e.teamId === match.awayTeamId) away++;
    }
    return { homeScore: home, awayScore: away };
  }
  const s = state as BasketballState;
  let home = 0, away = 0;
  for (const p of Object.values(s.players)) {
    if (p.teamId === match.homeTeamId) home += p.pts;
    else if (p.teamId === match.awayTeamId) away += p.pts;
  }
  return { homeScore: home, awayScore: away };
}

export function useTrackerMatch(matchId: string) {
  const [match, setMatch] = useState<TrackerMatch | null>(null);
  const [session, setSession] = useState<TrackerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const matchRef = useRef<TrackerMatch | null>(null);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  matchRef.current = match;

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getMatch(matchId)
      .then(({ match, session }) => {
        if (!mounted) return;
        setMatch(match);
        setSession(session);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [matchId]);

  // ── Socket: receive remote updates from co-scorers / spectators ──
  useEffect(() => {
    let mounted = true;
    auth.currentUser?.getIdToken().then((token) => {
      if (!mounted) return;
      const socketUrl = import.meta.env.VITE_API_URL || '/';
      const socket = io(socketUrl, { auth: { token }, transports: ['websocket'] });
      socketRef.current = socket;
      socket.emit('tracker:join', matchId);
      socket.on('tracker:state', (remote: TrackerMatch) => {
        if (remote.id !== matchId) return;
        // Don't clobber unsaved local edits.
        if (dirtyRef.current) return;
        setMatch(remote);
      });
    });
    return () => {
      mounted = false;
      socketRef.current?.emit('tracker:leave', matchId);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [matchId]);

  const flush = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const cur = matchRef.current;
    if (!cur || !dirtyRef.current) return;
    setSaving(true);
    try {
      await patchMatch(matchId, {
        state: cur.state as AnyState,
        homeScore: cur.homeScore,
        awayScore: cur.awayScore,
      });
      dirtyRef.current = false;
    } finally {
      setSaving(false);
    }
  }, [matchId]);

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush(); }, 500);
  }, [flush]);

  /** Apply a pure mutation to the live state; scores recompute & a save is queued. */
  const updateState = useCallback(
    (producer: (state: AnyState) => AnyState) => {
      setMatch((prev) => {
        if (!prev || !session) return prev;
        const newState = producer(prev.state as AnyState);
        const { homeScore, awayScore } = computeScores(prev, session.sport, newState);
        const next = { ...prev, state: newState, homeScore, awayScore };
        matchRef.current = next;
        schedule();
        return next;
      });
    },
    [session, schedule],
  );

  /** Persist a status change immediately (start / end match). */
  const setStatus = useCallback(
    async (status: TrackerMatchStatus) => {
      await flush();
      const cur = matchRef.current;
      const updated = await patchMatch(matchId, {
        status,
        state: cur?.state as AnyState | undefined,
        homeScore: cur?.homeScore,
        awayScore: cur?.awayScore,
      });
      setMatch((prev) => (prev ? { ...prev, ...updated } : updated));
    },
    [matchId, flush],
  );

  // Flush pending edits on unmount.
  useEffect(() => () => { void flush(); }, [flush]);

  return { match, session, loading, saving, updateState, setStatus, flush, setMatch };
}

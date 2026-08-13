import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { auth } from '../../config/firebase';
import { getMatch, patchMatch, saveJerseyNumbers } from './api';
import { type SaveState, reduceSaveState, retryDelayMs } from './saveState';
import type {
  TrackerMatch,
  TrackerSession,
  TrackerMatchStatus,
  FootballState,
  BasketballState,
  RosterTeam,
} from './types';

export type JerseyEdit = { userId: string; number: number | null };

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
  // The initial load's failure — surfaced so the route can show a real error
  // state (and log why) instead of silently bouncing out of a live-scoring page.
  const [loadError, setLoadError] = useState<unknown>(null);
  // Honest save state: an operator must never see "Saved" while an edit is
  // unpersisted (services/saveState). 'saved' ⇔ everything is on the server.
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const matchRef = useRef<TrackerMatch | null>(null);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempt = useRef(0);
  const socketRef = useRef<Socket | null>(null);
  // Mirror dirty into a ref-read boolean for the beforeunload guard.
  const applySave = useCallback((ev: Parameters<typeof reduceSaveState>[1]) => {
    setSaveState((prev) => reduceSaveState(prev, ev));
  }, []);

  matchRef.current = match;

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    getMatch(matchId)
      .then(({ match, session }) => {
        if (!mounted) return;
        setMatch(match);
        setSession(session);
      })
      .catch((err) => {
        if (!mounted) return;
        // Log the real reason (status, message) so a failed live-scoring load is
        // diagnosable — it must never just vanish to a redirect.
        console.error(`[tracker] failed to load match ${matchId}:`, err?.response?.status ?? '', err?.response?.data ?? err?.message ?? err);
        setLoadError(err);
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
    applySave({ type: 'save-start' });
    try {
      await patchMatch(matchId, {
        state: cur.state as AnyState,
        homeScore: cur.homeScore,
        awayScore: cur.awayScore,
      });
      // Only clear dirty once the server has actually accepted the write.
      dirtyRef.current = false;
      retryAttempt.current = 0;
      applySave({ type: 'save-ok' });
    } catch {
      // Keep dirty=true and tell the truth. Keep retrying on a backoff even if the
      // operator stops tapping, so a dropped connection self-heals when it returns.
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      applySave({ type: 'save-fail', online });
      retryAttempt.current += 1;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void flush(); }, retryDelayMs(retryAttempt.current));
    }
  }, [matchId, applySave]);

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    // An edit is owed a persist — reflect that immediately (never leave "Saved" up
    // while there are pending edits), then debounce the actual write.
    applySave({ type: 'edit' });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush(); }, 500);
  }, [flush, applySave]);

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

  /** Persist jersey numbers onto the session roster. Lives on the controller
   *  rather than being called straight from the view so the client-only demo
   *  can substitute a local implementation and never hit the network. */
  const saveJerseys = useCallback(
    async (numbers: JerseyEdit[]): Promise<RosterTeam[]> => {
      if (!session) return [];
      const roster = await saveJerseyNumbers(session.tournamentId, numbers);
      setSession((prev) => (prev ? { ...prev, roster } : prev));
      return roster;
    },
    [session],
  );

  // Flush pending edits on unmount.
  useEffect(() => () => { void flush(); }, [flush]);

  // Connectivity recovery + honest offline signal. When the network returns, push
  // pending edits straight away rather than waiting on the backoff; when it drops
  // with edits owed, say so immediately instead of after the next failed attempt.
  useEffect(() => {
    const onOnline = () => { if (dirtyRef.current) { retryAttempt.current = 0; void flush(); } };
    const onOffline = () => { if (dirtyRef.current) applySave({ type: 'save-fail', online: false }); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [flush, applySave]);

  // Unsaved-changes guard: warn before the tab closes while edits aren't on the
  // server. A new operator's game data must not vanish to an accidental close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = ''; // required for the browser's native confirm dialog
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Real matches persist through the API. The demo sandbox substitutes a
  // controller with `local: true`, which is what tells the basketball tracker to
  // keep its event log in memory instead of appending to a match that has no row.
  return { match, session, loading, loadError, saveState, local: false, updateState, setStatus, flush, setMatch, setSession, saveJerseys };
}

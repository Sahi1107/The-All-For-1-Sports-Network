import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { auth } from '../../config/firebase';
import {
  foldEvents,
  type TrackerEvent,
  type EventDraft,
  type DerivedState,
  type BasketballVariant,
} from '@af1/core';
import { getTrackerEvents, appendTrackerEvent, removeTrackerEvent } from './api';
import { retryDelayMs } from './saveState';

/**
 * Optimistic events sort after every confirmed one. A real `seq` comes from a
 * database sequence and will never reach this, so an entry the analyst just made
 * always renders last — which is where they expect to see it — and slots into
 * true order the moment the server's copy lands.
 */
const OPTIMISTIC_SEQ_BASE = Number.MAX_SAFE_INTEGER - 1_000_000;

const newClientId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** An entry we've drawn but the server hasn't acknowledged yet. */
interface PendingAppend {
  draft: EventDraft;
  attempt: number;
}

export interface TrackerEventsController {
  events: TrackerEvent[];
  derived: DerivedState;
  loading: boolean;
  loadError: unknown;
  /** Entries drawn on screen that the server hasn't confirmed. */
  unconfirmed: number;
  /** True once a send has failed and we're retrying — the UI must say so. */
  syncTrouble: boolean;
  append: (draft: Omit<EventDraft, 'clientId'>) => void;
  remove: (eventId: string) => Promise<void>;
}

/**
 * The tracker's live connection to one match's event log.
 *
 * Appends are optimistic because an analyst tapping through a fast break cannot
 * wait on a round trip — the entry must be on screen before the next play. The
 * server's copy then replaces it in place, matched on the draft's clientId.
 *
 * That clientId is also why a retry is safe: the append endpoint treats a repeat
 * as the same event, so a flaky venue connection produces one basket, not two.
 */
export function useTrackerEvents({
  matchId,
  homeTeamId,
  awayTeamId,
  quarterMs,
  variant,
  enabled = true,
  local = false,
}: {
  matchId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  quarterMs: number;
  /** Which basketball code — decides what each shot in the log is worth. Absent
   *  ⇒ 5v5, which is what every match logged before 3x3 existed was. */
  variant?: BasketballVariant | null;
  enabled?: boolean;
  /**
   * Keep the log in memory and never touch the network.
   *
   * The public demo sandbox runs the real tracker against a fabricated session
   * whose ids aren't in any database. Without this it would fire appends at
   * endpoints that reject them and sit in a retry loop behind a "not saved"
   * warning, which is a poor advert for a tool whose whole pitch is that it
   * doesn't lose your data.
   */
  local?: boolean;
}): TrackerEventsController {
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [pending, setPending] = useState<Record<string, PendingAppend>>({});
  // Counted rather than a flag so a retry that fails again keeps the warning up,
  // and so it clears only when the backlog is genuinely empty.
  const [failures, setFailures] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const lastSeqRef = useRef(0);
  const optimisticCounter = useRef(0);
  const retryTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Merge one authoritative event into the log.
   *
   * Matching on clientId first is what keeps an analyst's own entry from
   * appearing twice: it comes back both as the POST response and as the room
   * broadcast (the sender is in the room too), and both must land on the same
   * row that's already drawn.
   */
  const upsert = useCallback((incoming: TrackerEvent) => {
    setEvents((prev) => {
      const at = prev.findIndex((e) => e.id === incoming.id || e.clientId === incoming.clientId);
      const next = at >= 0
        ? prev.map((e, i) => (i === at ? incoming : e))
        : [...prev, incoming];
      next.sort((a, b) => a.seq - b.seq);
      return next;
    });
    if (incoming.seq > lastSeqRef.current) lastSeqRef.current = incoming.seq;
  }, []);

  const markRemoved = useCallback((eventId: string) => {
    setEvents((prev) => prev.map((e) => (
      e.id === eventId && !e.deletedAt ? { ...e, deletedAt: new Date().toISOString() } : e
    )));
  }, []);

  // ── Initial load ──────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await getTrackerEvents(matchId);
      setEvents(rows);
      lastSeqRef.current = rows.reduce((m, e) => Math.max(m, e.seq), 0);
    } catch (err) {
      // A live-scoring surface must never fail silently into an empty box score
      // that looks like a real 0–0.
      console.error(`[tracker] failed to load events for match ${matchId}:`, err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (!enabled || local) { setLoading(false); return; }
    void loadAll();
  }, [enabled, local, loadAll]);

  // ── Live feed ─────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || local) return;
    let mounted = true;
    void auth.currentUser?.getIdToken().then((token) => {
      if (!mounted) return;
      const socket = io(import.meta.env.VITE_API_URL || '/', {
        auth: { token },
        transports: ['websocket'],
      });
      socketRef.current = socket;
      socket.emit('tracker:join', matchId);

      socket.on('tracker:event', (payload: { event: TrackerEvent }) => {
        if (payload?.event?.matchId !== matchId) return;
        upsert(payload.event);
      });
      socket.on('tracker:event:removed', (payload: { eventId: string }) => {
        if (payload?.eventId) markRemoved(payload.eventId);
      });

      // Catch-up on reconnect. A dropped websocket during a run of play means
      // missed broadcasts, and re-joining the room alone would leave this
      // operator's box score permanently short of the co-scorer's entries.
      socket.on('connect', () => {
        socket.emit('tracker:join', matchId);
        void getTrackerEvents(matchId, lastSeqRef.current)
          .then((rows) => rows.forEach(upsert))
          .catch((err) => console.error('[tracker] catch-up failed:', err));
      });
    });
    return () => {
      mounted = false;
      socketRef.current?.emit('tracker:leave', matchId);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [matchId, enabled, local, upsert, markRemoved]);

  // ── Append, with retry ────────────────────────────────────
  const send = useCallback(async (clientId: string, entry: PendingAppend) => {
    try {
      const { event } = await appendTrackerEvent(matchId, entry.draft);
      upsert(event);
      setPending((p) => {
        const rest = { ...p };
        delete rest[clientId];
        return rest;
      });
    } catch (err) {
      console.error('[tracker] append failed, will retry:', err);
      setFailures((n) => n + 1);
      const attempt = entry.attempt + 1;
      setPending((p) => (p[clientId] ? { ...p, [clientId]: { ...entry, attempt } } : p));
      const t = setTimeout(() => {
        retryTimers.current.delete(clientId);
        void send(clientId, { ...entry, attempt });
      }, retryDelayMs(attempt));
      retryTimers.current.set(clientId, t);
    }
  }, [matchId, upsert]);

  const append = useCallback((draft: Omit<EventDraft, 'clientId'>) => {
    const clientId = newClientId();
    const full: EventDraft = { ...draft, clientId };

    optimisticCounter.current += 1;
    const optimistic: TrackerEvent = {
      id: `optimistic-${clientId}`,
      matchId,
      seq: OPTIMISTIC_SEQ_BASE + optimisticCounter.current,
      kind: full.kind,
      playerId: full.playerId ?? null,
      teamId: full.teamId ?? null,
      x: full.x ?? null,
      y: full.y ?? null,
      basket: full.basket ?? null,
      quarter: full.quarter,
      clockMs: full.clockMs,
      payload: full.payload ?? null,
      clientId,
      actorId: null,
      // The fold credits court time off createdAt, so an optimistic event must
      // carry a plausible now rather than a placeholder — otherwise the on-screen
      // clock would jump the moment the server's copy replaced it.
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    setEvents((prev) => [...prev, optimistic]);
    // In local mode the optimistic entry IS the entry — there is no server copy
    // coming to replace it, so it must not be left queued as unsaved forever.
    if (local) return;
    setPending((p) => ({ ...p, [clientId]: { draft: full, attempt: 0 } }));
    void send(clientId, { draft: full, attempt: 0 });
  }, [matchId, send, local]);

  const remove = useCallback(async (eventId: string) => {
    if (local) { markRemoved(eventId); return; }
    // Draw the removal straight away — the analyst is fixing a mistake mid-play
    // and needs to see it gone — then confirm.
    markRemoved(eventId);
    try {
      await removeTrackerEvent(matchId, eventId);
    } catch (err) {
      console.error('[tracker] remove failed:', err);
      setFailures((n) => n + 1);
      // Put it back: the entry is still counting on the server, and leaving it
      // struck through here would show a box score that disagrees with the one
      // everybody else — and the published result — will see.
      void loadAll();
    }
  }, [matchId, markRemoved, loadAll, local]);

  useEffect(() => {
    const timers = retryTimers.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const derived = useMemo(
    () => foldEvents(events, { homeTeamId, awayTeamId, quarterMs, variant: variant ?? undefined }),
    [events, homeTeamId, awayTeamId, quarterMs, variant],
  );

  const unconfirmed = Object.keys(pending).length;
  // Only claim trouble while something is actually outstanding — a send that
  // failed once and then succeeded on retry is not a state worth alarming about.
  const syncTrouble = failures > 0 && unconfirmed > 0;

  // Reset the failure count once the backlog drains, so the next blip starts clean.
  useEffect(() => {
    if (unconfirmed === 0 && failures > 0) setFailures(0);
  }, [unconfirmed, failures]);

  // Unsaved-entry guard. Same principle the old blob tracker held to: never let
  // a tab close quietly on entries that aren't on the server.
  useEffect(() => {
    if (unconfirmed === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unconfirmed]);

  return { events, derived, loading, loadError, unconfirmed, syncTrouble, append, remove };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './tracker.css';
import type { useTrackerMatch } from '../useTrackerMatch';
import type { RosterTeam, RosterPlayer, TrackerMatch } from '../types';
import {
  liveClockMs, formatClock, parseClockToElapsedMs, teamTotals, emptyLine,
  shotValueMismatch, isFieldGoal, toSnapshot,
  type Basket, type EventKind, type BoxScoreLine, type DerivedState, type TrackerEvent,
} from '@af1/core';
import { useTrackerEvents } from '../useTrackerEvents';
import { EntryCourt, type CourtClick } from './Court';
import { ShotChart, LiveShotLayer } from './ShotChart';
import { BoxScorePanel, PlayerStatLine } from './BoxScore';
import { JerseyModal, StartersModal } from './PreMatch';
import { isFouledOut, inFoulTrouble, teamFoulsInQuarter, teamInBonus } from './rules';

type Ctrl = ReturnType<typeof useTrackerMatch>;

/**
 * Keyboard entry.
 *
 * The existing bindings are unchanged — 2, 3, O, D, A, S, B, T mean exactly what
 * they always did, because analysts have them in muscle memory and a redesign is
 * not a reason to make them relearn the one part that was already fast.
 *
 * Digits are matched on `event.code`, not `event.key`: Shift+2 produces "@" on a
 * US layout and something else again elsewhere, so keying off the character
 * would break the miss bindings for anyone not on the layout it was written on.
 *
 * New, and additive only:
 *   Shift+digit  the same shot, missed
 *   1 / Shift+1  free throw made / missed
 *   F            personal foul — it now has a shortcut because the team-foul
 *                count is DERIVED from the event rather than a second thing the
 *                handler has to remember to bump, which is what made it unsafe
 *                to bind before.
 */
const DIGIT_SHORTCUTS: Record<string, { made: EventKind; miss: EventKind; label: string }> = {
  Digit2: { made: 'FG2_MADE', miss: 'FG2_MISS', label: '2PT' },
  Digit3: { made: 'FG3_MADE', miss: 'FG3_MISS', label: '3PT' },
  Digit1: { made: 'FT_MADE', miss: 'FT_MISS', label: 'FT' },
};
const LETTER_SHORTCUTS: Record<string, { kind: EventKind; label: string }> = {
  o: { kind: 'OREB', label: 'OREB' },
  d: { kind: 'DREB', label: 'DREB' },
  a: { kind: 'AST', label: 'AST' },
  s: { kind: 'STL', label: 'STL' },
  b: { kind: 'BLK', label: 'BLK' },
  t: { kind: 'TO', label: 'TO' },
  f: { kind: 'PF', label: 'FOUL' },
};

/** What the legend under the court shows. */
const LEGEND: { keys: string; label: string }[] = [
  { keys: '2 / ⇧2', label: '2PT made / miss' },
  { keys: '3 / ⇧3', label: '3PT made / miss' },
  { keys: '1 / ⇧1', label: 'FT made / miss' },
  { keys: 'O', label: 'OREB' },
  { keys: 'D', label: 'DREB' },
  { keys: 'A', label: 'AST' },
  { keys: 'S', label: 'STL' },
  { keys: 'B', label: 'BLK' },
  { keys: 'T', label: 'TO' },
  { keys: 'F', label: 'FOUL' },
];

const KIND_LABEL: Record<string, string> = {
  FG2_MADE: '2PT made', FG2_MISS: '2PT miss',
  FG3_MADE: '3PT made', FG3_MISS: '3PT miss',
  FT_MADE: 'FT made', FT_MISS: 'FT miss',
  OREB: 'OREB', DREB: 'DREB', AST: 'AST', STL: 'STL', BLK: 'BLK', TO: 'TO', PF: 'FOUL',
  SUB: 'Substitution', CLOCK_SET: 'Clock set', CLOCK_START: 'Clock started',
  CLOCK_STOP: 'Clock stopped', QUARTER_SET: 'Period change', LINEUP_SET: 'Lineup set',
  PERIOD_BASKETS_SWAP: 'Baskets swapped',
};

export default function BasketballMatch({ ctrl }: { ctrl: Ctrl }) {
  const { match, session, setStatus, saveJerseys, setMatch, local } = ctrl;

  const homeTeam = (session?.roster ?? []).find((t) => t.teamId === match?.homeTeamId);
  const awayTeam = (session?.roster ?? []).find((t) => t.teamId === match?.awayTeamId);
  const quarterMs = (session?.config?.quarterSeconds ?? 720) * 1000;
  const locked = match?.status === 'PUBLISHED';

  const {
    events, derived, loading, loadError, unconfirmed, syncTrouble, append, remove,
  } = useTrackerEvents({
    matchId: match?.id ?? '',
    homeTeamId: match?.homeTeamId ?? null,
    awayTeamId: match?.awayTeamId ?? null,
    quarterMs,
    enabled: !!match?.id,
    local,
  });

  // The demo sandbox has no server to fold the log for it, so the tracker feeds
  // its own derived result back onto the in-memory match. That's what the demo
  // tournament reads when the fixture ends, to score it and advance the bracket.
  useEffect(() => {
    if (!local || !match) return;
    const snapshot = toSnapshot(derived, quarterMs / 1000);
    const home = teamTotals(derived.players, match.homeTeamId).pts;
    const away = teamTotals(derived.players, match.awayTeamId).pts;
    setMatch((prev) => (prev
      ? { ...prev, state: snapshot as unknown as TrackerMatch['state'], homeScore: home, awayScore: away }
      : prev));
  }, [local, derived, quarterMs, match?.homeTeamId, match?.awayTeamId, setMatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** A field goal waiting on its court position. */
  const [armed, setArmed] = useState<{ kind: EventKind; playerId: string; label: string } | null>(null);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'hint' | 'bad'; n: number } | null>(null);
  const [jerseyOpen, setJerseyOpen] = useState(false);
  const [jerseysDone, setJerseysDone] = useState(false);
  const [chartFor, setChartFor] = useState<'home' | 'away' | null>(null);

  // Wall time for the ticking clock display. Held in state rather than read at
  // render so rendering stays pure — and it only advances while the clock runs,
  // which is also the only time the displayed value can change.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!derived.clockRunning) return;
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, [derived.clockRunning]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const allPlayers = useMemo(() => {
    const m = new Map<string, RosterPlayer & { teamId: string }>();
    for (const t of [homeTeam, awayTeam]) {
      for (const p of t?.players ?? []) m.set(p.userId, { ...p, teamId: t!.teamId });
    }
    return m;
  }, [homeTeam, awayTeam]);

  const teamIdOf = useCallback((playerId: string) => allPlayers.get(playerId)?.teamId ?? null, [allPlayers]);

  // Read at call time, never at render — these fire from handlers, where the
  // clock's true current value is what an entry should be stamped with.
  const clockNow = useCallback(
    () => liveClockMs(derived, Date.now(), quarterMs),
    [derived, quarterMs],
  );

  /** Which basket the given player's side is attacking right now. */
  const basketFor = useCallback((playerId: string): Basket => {
    const isHome = teamIdOf(playerId) === match?.homeTeamId;
    const home = derived.homeAttacks;
    return isHome ? home : home === 'LEFT' ? 'RIGHT' : 'LEFT';
  }, [teamIdOf, match?.homeTeamId, derived.homeAttacks]);

  const say = useCallback(
    (text: string, tone: 'ok' | 'hint' | 'bad' = 'ok') => setFlash({ text, tone, n: Date.now() }),
    [],
  );

  /** Append a stat for the armed player. Field goals go through the court first. */
  const enter = useCallback((kind: EventKind, label: string) => {
    if (locked) return;
    if (!selectedId) { say('Select a player first', 'hint'); return; }
    const teamId = teamIdOf(selectedId);
    if (!teamId) { say('That player is not on either roster', 'bad'); return; }

    if (isFieldGoal(kind)) {
      // Mandatory location: hold the entry until the court is clicked. Nobody can
      // reconstruct where a shot came from after the fact, so an attempt saved
      // without a spot is a permanent hole in the chart.
      setArmed({ kind, playerId: selectedId, label });
      return;
    }
    append({ kind, playerId: selectedId, teamId, quarter: derived.quarter, clockMs: clockNow() });
    say(`${allPlayers.get(selectedId)?.name ?? 'Player'} · ${label}`);
  }, [locked, selectedId, teamIdOf, append, derived.quarter, allPlayers, clockNow, say]);

  /** The court click that completes an armed shot. */
  const placeShot = useCallback((p: CourtClick) => {
    if (!armed) return;
    const teamId = teamIdOf(armed.playerId);
    if (!teamId) return;
    const basket = basketFor(armed.playerId);
    append({
      kind: armed.kind, playerId: armed.playerId, teamId,
      x: p.x, y: p.y, basket,
      quarter: derived.quarter, clockMs: clockNow(),
    });
    const who = allPlayers.get(armed.playerId)?.name ?? 'Player';
    // Warn, never block: the analyst watched the play and their key is the
    // decision. This just surfaces a mis-key while it's still cheap to fix.
    const mismatch = shotValueMismatch(armed.kind, p.x, p.y, basket);
    if (mismatch === 'EXPECTED_THREE') say(`${who} · ${armed.label} — that spot is behind the arc`, 'hint');
    else if (mismatch === 'EXPECTED_TWO') say(`${who} · ${armed.label} — that spot is inside the arc`, 'hint');
    else say(`${who} · ${armed.label}`);
    setArmed(null);
  }, [armed, teamIdOf, basketFor, append, derived.quarter, allPlayers, clockNow, say]);

  // ── Keyboard ──────────────────────────────────────────────
  const keysBlocked = locked || jerseyOpen || loading;
  // The key handler is bound once and reads the latest `enter` through a ref, so
  // a rebind isn't needed on every render — rebinding mid-game would drop a
  // keystroke that arrives between the removal and the re-add.
  const enterRef = useRef(enter);
  useEffect(() => { enterRef.current = enter; }, [enter]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      // Never steal a keystroke aimed at a form control — typing in the clock
      // field or a sub dropdown must not record a stat.
      if (el?.closest('input, select, textarea, [contenteditable="true"]')) return;
      if (e.key === 'Escape') {
        // Escape backs out of an armed shot first, then clears the player. An
        // analyst who armed the wrong shot needs a way out that doesn't also
        // lose the player they'd already picked.
        if (armed) { setArmed(null); say('Shot cancelled', 'hint'); }
        else setSelectedId(null);
        return;
      }
      if (keysBlocked) return;

      const digit = DIGIT_SHORTCUTS[e.code];
      if (digit) {
        e.preventDefault();
        const kind = e.shiftKey ? digit.miss : digit.made;
        enterRef.current(kind, `${digit.label} ${e.shiftKey ? 'miss' : 'made'}`);
        return;
      }
      const letter = LETTER_SHORTCUTS[e.key.toLowerCase()];
      if (letter) {
        e.preventDefault();
        enterRef.current(letter.kind, letter.label);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keysBlocked, armed, say]);

  // ── Clock + period controls ───────────────────────────────
  const control = useCallback((kind: EventKind, payload?: Record<string, unknown>) => {
    if (locked) return;
    append({ kind, quarter: derived.quarter, clockMs: clockNow(), payload: payload ?? null });
  }, [locked, append, derived.quarter, clockNow]);

  if (!match || !session || !homeTeam || !awayTeam) {
    return <div className="card" style={{ background: '#0f172a' }}>Teams not assigned yet.</div>;
  }
  if (loadError) {
    return (
      <div className="card" style={{ background: '#0f172a' }}>
        <strong>Couldn't load this match's entries.</strong>
        <div style={{ color: '#9ca3af', marginTop: 6 }}>
          Nothing has been lost — reload to try again. Entries already recorded are on the server.
        </div>
      </div>
    );
  }

  const home = homeTeam.teamId;
  const away = awayTeam.teamId;
  const noLineups = derived.onCourtHome.length + derived.onCourtAway.length === 0;
  const showJerseys = jerseyOpen || (noLineups && !jerseysDone && !loading);
  const showStarters = noLineups && !showJerseys && !loading;

  const homeScore = teamTotals(derived.players, home).pts;
  const awayScore = teamTotals(derived.players, away).pts;
  const selected = selectedId ? allPlayers.get(selectedId) : undefined;
  const selectedLine = selectedId ? derived.players[selectedId] ?? emptyLine(teamIdOf(selectedId)) : null;

  const lookup = (playerId: string) => {
    const p = allPlayers.get(playerId);
    return p ? { name: p.name, jersey: p.number } : undefined;
  };

  function saveStarters(h: string[], a: string[]) {
    append({ kind: 'LINEUP_SET', teamId: home, quarter: derived.quarter, clockMs: 0, payload: { side: 'home', lineup: h } });
    append({ kind: 'LINEUP_SET', teamId: away, quarter: derived.quarter, clockMs: 0, payload: { side: 'away', lineup: a } });
    void setStatus('IN_PROGRESS');
  }

  function endMatch() {
    if (!confirm('End match? You can still export and publish afterward.')) return;
    if (derived.clockRunning) control('CLOCK_STOP');
    void setStatus('COMPLETED');
  }

  return (
    <div className="bb2">
      <Scoreboard
        homeName={homeTeam.name} awayName={awayTeam.name}
        homeScore={homeScore} awayScore={awayScore}
        derived={derived} quarterMs={quarterMs} locked={locked} nowMs={nowMs}
        homeFouls={teamFoulsInQuarter(derived.teamFoulsHome, derived.quarter)}
        awayFouls={teamFoulsInQuarter(derived.teamFoulsAway, derived.quarter)}
        onControl={control}
        unconfirmed={unconfirmed} syncTrouble={syncTrouble}
        onJerseys={() => setJerseyOpen(true)} onEnd={endMatch}
      />

      {showJerseys && (
        <JerseyModal
          persist={saveJerseys} homeTeam={homeTeam} awayTeam={awayTeam}
          onClose={() => { setJerseyOpen(false); setJerseysDone(true); }}
          onSaved={() => { setJerseyOpen(false); setJerseysDone(true); }}
        />
      )}
      {showStarters && (
        <StartersModal homeTeam={homeTeam} awayTeam={awayTeam}
          onBack={() => setJerseyOpen(true)} onSave={saveStarters} />
      )}

      <div className="bb2-main">
        <RosterRail
          side="home" team={homeTeam} derived={derived} disabled={locked}
          selectedId={selectedId} onSelect={setSelectedId}
          onSub={(outIds, inIds) => append({
            kind: 'SUB', teamId: home, quarter: derived.quarter, clockMs: clockNow(),
            payload: { outIds, inIds },
          })}
          onShowChart={() => setChartFor('home')}
        />

        <div className="bb2-centre">
          <EntryCourt
            armed={!!armed}
            onPick={placeShot}
            overlay={armed ? (
              <div className="bb2-arm" role="status">
                <span className="bb2-arm-what">{armed.label}</span>
                <span className="bb2-arm-who">
                  #{allPlayers.get(armed.playerId)?.number ?? '–'} {allPlayers.get(armed.playerId)?.name}
                </span>
                <span className="bb2-arm-hint">Click where the shot was taken · Esc to cancel</span>
              </div>
            ) : null}
          >
            <LiveShotLayer shots={derived.shots} />
          </EntryCourt>

          <ActionBar
            disabled={locked || !selectedId}
            armedKind={armed?.kind ?? null}
            onAction={enter}
          />

          <div className="bb2-legend">
            {LEGEND.map((l) => (
              <span key={l.keys} className="bb2-legend-item"><kbd>{l.keys}</kbd>{l.label}</span>
            ))}
          </div>

          {flash && <div className={`bb2-flash ${flash.tone}`} role="status">{flash.text}</div>}
        </div>

        <RosterRail
          side="away" team={awayTeam} derived={derived} disabled={locked}
          selectedId={selectedId} onSelect={setSelectedId}
          onSub={(outIds, inIds) => append({
            kind: 'SUB', teamId: away, quarter: derived.quarter, clockMs: clockNow(),
            payload: { outIds, inIds },
          })}
          onShowChart={() => setChartFor('away')}
        />
      </div>

      {selected && selectedLine && (
        <div className="bb2-selected">
          <PlayerStatLine name={selected.name} jersey={selected.number} line={selectedLine} />
          <ShotChart
            shots={derived.shots.filter((s) => s.playerId === selected.userId)}
            lookup={lookup}
            title={`${selected.name} — shot chart`}
            emptyHint="No field goals attempted yet."
          />
        </div>
      )}

      <RecentEntries
        events={events} derived={derived} allPlayers={allPlayers}
        disabled={locked} onRemove={remove}
      />

      <BoxScorePanel
        homeTeam={homeTeam} awayTeam={awayTeam} derived={derived}
        onPickPlayer={setSelectedId} selectedId={selectedId}
      />

      {chartFor && (
        <TeamChartModal
          team={chartFor === 'home' ? homeTeam : awayTeam}
          shots={derived.shots.filter((s) => s.teamId === (chartFor === 'home' ? home : away))}
          lookup={lookup}
          onClose={() => setChartFor(null)}
        />
      )}
    </div>
  );
}

// ─── Scoreboard ──────────────────────────────────────────────

function Scoreboard({
  homeName, awayName, homeScore, awayScore, derived, quarterMs, locked, nowMs,
  homeFouls, awayFouls, onControl, unconfirmed, syncTrouble, onJerseys, onEnd,
}: {
  homeName: string; awayName: string; homeScore: number; awayScore: number;
  derived: DerivedState; quarterMs: number; locked: boolean;
  /** Wall time from the parent's tick — passed in so rendering stays pure. */
  nowMs: number;
  homeFouls: number; awayFouls: number;
  onControl: (kind: EventKind, payload?: Record<string, unknown>) => void;
  unconfirmed: number; syncTrouble: boolean;
  onJerseys: () => void; onEnd: () => void;
}) {
  const [setting, setSetting] = useState(false);
  const [draft, setDraft] = useState('');
  const elapsed = liveClockMs(derived, nowMs, quarterMs);

  function commitClock() {
    const ms = parseClockToElapsedMs(draft, quarterMs);
    if (ms === null) return;
    onControl('CLOCK_SET', { clockMs: ms });
    setSetting(false);
    setDraft('');
  }

  return (
    <header className="bb2-board">
      <div className="bb2-board-team home">
        <span className="bb2-board-name">{homeName}</span>
        <span className={`bb2-board-fouls${teamInBonus(homeFouls) ? ' bonus' : ''}`}>
          Fouls {homeFouls}{teamInBonus(homeFouls) ? ' · BONUS' : ''}
        </span>
      </div>
      <div className="bb2-board-score">{homeScore}</div>

      <div className="bb2-board-centre">
        <div className="bb2-board-period">
          <button className="bb2-mini" disabled={locked || derived.quarter <= 1}
            onClick={() => onControl('QUARTER_SET', { quarter: derived.quarter - 1 })}>−</button>
          <span>Q{derived.quarter}</span>
          <button className="bb2-mini" disabled={locked}
            onClick={() => onControl('QUARTER_SET', { quarter: derived.quarter + 1 })}>+</button>
        </div>

        {setting ? (
          // Set the clock to an exact time. Every stoppage correction a scorer
          // needs comes down to this, and the old tracker could only zero it.
          <form className="bb2-clock-set" onSubmit={(e) => { e.preventDefault(); commitClock(); }}>
            <input
              autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="mm:ss" inputMode="numeric" aria-label="Set clock to (time remaining)"
              onKeyDown={(e) => { if (e.key === 'Escape') { setSetting(false); setDraft(''); } }}
            />
            <button type="submit" className="bb2-mini" disabled={parseClockToElapsedMs(draft, quarterMs) === null}>Set</button>
            <button type="button" className="bb2-mini" onClick={() => { setSetting(false); setDraft(''); }}>✕</button>
          </form>
        ) : (
          <button
            className="bb2-clock" disabled={locked}
            onClick={() => { setSetting(true); setDraft(formatClock(elapsed, quarterMs)); }}
            title="Click to set the clock to an exact time"
          >
            {formatClock(elapsed, quarterMs)}
          </button>
        )}

        <div className="bb2-board-clockbtns">
          {derived.clockRunning
            ? <button className="bb2-btn stop" disabled={locked} onClick={() => onControl('CLOCK_STOP')}>Stop</button>
            : <button className="bb2-btn go" disabled={locked} onClick={() => onControl('CLOCK_START')}>Start</button>}
          <button className="bb2-btn" disabled={locked} onClick={() => onControl('PERIOD_BASKETS_SWAP')} title="Teams changed ends">
            Swap ends
          </button>
        </div>

        <div className="bb2-board-status">
          {syncTrouble
            ? <span className="bb2-sync bad">Reconnecting — {unconfirmed} not saved</span>
            : unconfirmed > 0
              ? <span className="bb2-sync busy">Saving {unconfirmed}…</span>
              : <span className="bb2-sync ok">All entries saved</span>}
        </div>
      </div>

      <div className="bb2-board-score">{awayScore}</div>
      <div className="bb2-board-team away">
        <span className="bb2-board-name">{awayName}</span>
        <span className={`bb2-board-fouls${teamInBonus(awayFouls) ? ' bonus' : ''}`}>
          Fouls {awayFouls}{teamInBonus(awayFouls) ? ' · BONUS' : ''}
        </span>
      </div>

      <div className="bb2-board-actions">
        <button className="bb2-btn" onClick={onJerseys}>Jersey #s</button>
        <button className="bb2-btn danger" onClick={onEnd} disabled={locked}>End match</button>
      </div>
    </header>
  );
}

// ─── Roster rail ─────────────────────────────────────────────

function RosterRail({ side, team, derived, disabled, selectedId, onSelect, onSub, onShowChart }: {
  side: 'home' | 'away';
  team: RosterTeam;
  derived: DerivedState;
  disabled: boolean;
  selectedId: string | null;
  onSelect: (playerId: string) => void;
  onSub: (outIds: string[], inIds: string[]) => void;
  onShowChart: () => void;
}) {
  const onCourt = new Set(side === 'home' ? derived.onCourtHome : derived.onCourtAway);
  const [subMode, setSubMode] = useState(false);
  const [outs, setOuts] = useState<Set<string>>(new Set());
  const [ins, setIns] = useState<Set<string>>(new Set());

  const reset = () => { setOuts(new Set()); setIns(new Set()); };
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const balanced = outs.size > 0 && outs.size === ins.size;
  const rows = [...team.players].sort((a, b) =>
    Number(onCourt.has(b.userId)) - Number(onCourt.has(a.userId)));

  function apply() {
    onSub([...outs], [...ins]);
    reset();
    setSubMode(false);
  }

  return (
    <aside className={`bb2-rail ${side}`}>
      <div className="bb2-rail-head">
        <strong>{team.name}</strong>
        <span className="bb2-rail-pts">{teamTotals(derived.players, team.teamId).pts}</span>
      </div>

      <div className="bb2-rail-list">
        {rows.map((p) => {
          const line: BoxScoreLine = derived.players[p.userId] ?? emptyLine(team.teamId);
          const on = onCourt.has(p.userId);
          const picked = subMode ? (on ? outs.has(p.userId) : ins.has(p.userId)) : p.userId === selectedId;
          const fouledOut = isFouledOut(line.pf);
          return (
            <button
              key={p.userId}
              type="button"
              className={[
                'bb2-chip',
                on ? 'on' : 'bench',
                picked ? 'picked' : '',
                subMode ? (on ? 'subout' : 'subin') : '',
                fouledOut ? 'fouledout' : '',
              ].filter(Boolean).join(' ')}
              disabled={disabled}
              onClick={() => (subMode ? toggle(on ? setOuts : setIns, p.userId) : onSelect(p.userId))}
              aria-pressed={picked}
            >
              <span className="bb2-chip-num">{p.number ?? '–'}</span>
              <span className="bb2-chip-body">
                <span className="bb2-chip-name">{p.name}</span>
                <span className="bb2-chip-line">
                  {line.pts} PTS · {line.reb} REB · {line.ast} AST
                </span>
              </span>
              <span className="bb2-chip-tail">
                <span className={`bb2-chip-pf${fouledOut ? ' out' : inFoulTrouble(line.pf) ? ' warn' : ''}`}>
                  {line.pf}F
                </span>
                {fouledOut && <span className="bb2-chip-flag">OUT</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bb2-rail-foot">
        {subMode ? (
          <>
            <button className="bb2-btn go" disabled={disabled || !balanced} onClick={apply}>
              Sub {outs.size}⇄{ins.size}
            </button>
            <button className="bb2-btn" onClick={() => { reset(); setSubMode(false); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="bb2-btn" disabled={disabled} onClick={() => setSubMode(true)}>Subs</button>
            <button className="bb2-btn" onClick={onShowChart}>Shot chart</button>
          </>
        )}
      </div>
      {subMode && (
        <p className="bb2-rail-hint">
          Tap players on court to bring off, bench players to send on — equal numbers, then Sub.
        </p>
      )}
    </aside>
  );
}

// ─── Action bar ──────────────────────────────────────────────

/** The two rows of tap targets, as data — so the buttons below are a map over a
 *  constant rather than a component redefined on every render. */
const SHOT_ACTIONS: { kind: EventKind; label: string; tone: 'made' | 'miss' }[] = [
  { kind: 'FG2_MADE', label: '2PT made', tone: 'made' },
  { kind: 'FG2_MISS', label: '2PT miss', tone: 'miss' },
  { kind: 'FG3_MADE', label: '3PT made', tone: 'made' },
  { kind: 'FG3_MISS', label: '3PT miss', tone: 'miss' },
  { kind: 'FT_MADE', label: 'FT made', tone: 'made' },
  { kind: 'FT_MISS', label: 'FT miss', tone: 'miss' },
];
const OTHER_ACTIONS: { kind: EventKind; label: string }[] = [
  { kind: 'OREB', label: 'OREB' },
  { kind: 'DREB', label: 'DREB' },
  { kind: 'AST', label: 'AST' },
  { kind: 'STL', label: 'STL' },
  { kind: 'BLK', label: 'BLK' },
  { kind: 'TO', label: 'TO' },
  { kind: 'PF', label: 'FOUL' },
];

function ActionBar({ disabled, armedKind, onAction }: {
  disabled: boolean;
  armedKind: EventKind | null;
  onAction: (kind: EventKind, label: string) => void;
}) {
  const btn = (a: { kind: EventKind; label: string; tone?: 'made' | 'miss' }) => (
    <button
      key={a.kind}
      type="button"
      className={`bb2-act${a.tone ? ` ${a.tone}` : ''}${armedKind === a.kind ? ' armed' : ''}`}
      disabled={disabled}
      onClick={() => onAction(a.kind, a.label)}
    >
      {a.label}
    </button>
  );
  return (
    <div className="bb2-actions">
      <div className="bb2-actions-row">{SHOT_ACTIONS.map(btn)}</div>
      <div className="bb2-actions-row">{OTHER_ACTIONS.map(btn)}</div>
    </div>
  );
}

// ─── Recent entries (the "−" removal surface) ────────────────

/**
 * The last handful of entries, each with a "−".
 *
 * Deliberately a list rather than a single undo: the entry an analyst needs to
 * take back is frequently not the most recent one — a co-scorer has usually
 * added two more since, and on a busy possession the wrong stat is spotted a few
 * plays later. Removing by id also means two operators can correct different
 * mistakes at once without fighting over one undo stack.
 */
function RecentEntries({ events, derived, allPlayers, disabled, onRemove }: {
  events: TrackerEvent[];
  derived: DerivedState;
  allPlayers: Map<string, RosterPlayer & { teamId: string }>;
  disabled: boolean;
  onRemove: (eventId: string) => void;
}) {
  const recent = useMemo(
    () => events
      .filter((e) => e.playerId && !e.deletedAt)
      .slice(-12)
      .reverse(),
    [events],
  );
  if (recent.length === 0) return null;

  return (
    <section className="bb2-recent">
      <div className="bb2-recent-head">
        <strong>Recent entries</strong>
        <span>Tap − to remove a wrong entry</span>
      </div>
      <ul className="bb2-recent-list">
        {recent.map((e) => {
          const who = e.playerId ? allPlayers.get(e.playerId) : undefined;
          const secs = Math.floor(e.clockMs / 1000);
          const pendingSave = e.id.startsWith('optimistic-');
          return (
            <li key={e.id} className={pendingSave ? 'pending' : undefined}>
              <span className="bb2-recent-q">Q{e.quarter} {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>
              <span className="bb2-recent-num">#{who?.number ?? '–'}</span>
              <span className="bb2-recent-name">{who?.name ?? 'Unknown'}</span>
              <span className="bb2-recent-kind">{KIND_LABEL[e.kind] ?? e.kind}</span>
              <button
                type="button"
                className="bb2-recent-del"
                // An entry the server hasn't acknowledged has no id to remove by
                // yet. Blocking for that beat is better than firing a delete at
                // an id that doesn't exist and leaving the stat counted.
                disabled={disabled || pendingSave}
                title={pendingSave ? 'Saving…' : 'Remove this entry'}
                onClick={() => onRemove(e.id)}
                aria-label={`Remove ${KIND_LABEL[e.kind] ?? e.kind} for ${who?.name ?? 'player'}`}
              >
                −
              </button>
            </li>
          );
        })}
      </ul>
      <div className="bb2-recent-foot">{derived.shots.length} shots plotted this match</div>
    </section>
  );
}

// ─── Team shot chart modal ───────────────────────────────────

function TeamChartModal({ team, shots, lookup, onClose }: {
  team: RosterTeam;
  shots: DerivedState['shots'];
  lookup: (id: string) => { name: string; jersey: number | null } | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="bball-modal-backdrop" onClick={onClose}>
      <div className="bball-modal bb2-chartmodal" onClick={(e) => e.stopPropagation()}>
        <div className="bb2-chartmodal-head">
          <h3>{team.name} — team shot chart</h3>
          <button className="bb2-btn" onClick={onClose}>Close</button>
        </div>
        <ShotChart shots={shots} lookup={lookup} />
        <p className="bb2-chartmodal-hint">
          Hover any marker for the shooter's name and number. Both ends of the floor
          fold onto one half, so the whole game reads as a single picture.
        </p>
      </div>
    </div>
  );
}

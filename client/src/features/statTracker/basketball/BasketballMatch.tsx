import { useEffect, useRef, useState } from 'react';
import './tracker.css';
import type { useTrackerMatch, JerseyEdit } from '../useTrackerMatch';
import type {
  BasketballState, BasketballPlayer, BasketballActionKind, RosterTeam,
} from '../types';
import {
  bumpTeamFoul, teamFoulsInQuarter, teamInBonus, isFouledOut, inFoulTrouble, FOUL_OUT_LIMIT,
} from './rules';

type Ctrl = ReturnType<typeof useTrackerMatch>;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// Column titles live in ONE place so the <thead> and the copy repeated above the
// second team's rows can never drift apart when a column is added or renamed.
// NOTE (Sahil): the FG%/3P%/FT% columns are intentionally NOT on the live
// tracker. The tracker is an ENTRY surface — a scorer only taps makes/misses;
// percentages are derived, read-only values nobody enters mid-game. They still
// render on the public box score (MatchDetailModal) and the Performance Card.
// Dropping them here reclaims ~150px so the 16→13 columns fit a landscape
// tablet with far less horizontal scroll. Attempts stay (FGM/FGA etc.).
// `kind` drives the <colgroup> below, which is what makes the grid fit a laptop
// without horizontal scroll: the table is table-layout:fixed, so these classes
// (not the content) decide each column's width, and the name column absorbs
// the slack on wider screens.
const COLUMNS: { label: string; kind: 'player' | 'num' | 'cnt' | 'shot' }[] = [
  { label: 'Player', kind: 'player' },
  { label: 'MIN', kind: 'num' },
  { label: 'PTS', kind: 'num' },
  { label: 'OREB', kind: 'cnt' },
  { label: 'DREB', kind: 'cnt' },
  { label: 'AST', kind: 'cnt' },
  { label: 'STL', kind: 'cnt' },
  { label: 'BLK', kind: 'cnt' },
  { label: 'TO', kind: 'cnt' },
  { label: 'PF', kind: 'cnt' },
  { label: 'FGM / FGA', kind: 'shot' },
  { label: '3PM / 3PA', kind: 'shot' },
  { label: 'FTM / FTA', kind: 'shot' },
];
const COL_COUNT = COLUMNS.length;

function ColGroup() {
  return <colgroup>{COLUMNS.map((c) => <col key={c.label} className={`col-${c.kind}`} />)}</colgroup>;
}

function ColumnHeaderRow({ repeat = false }: { repeat?: boolean }) {
  return (
    <tr className={repeat ? 'bball-colhead' : undefined}>
      {COLUMNS.map((c) => <th key={c.label} scope="col">{c.label}</th>)}
    </tr>
  );
}

// Keyboard entry: select a player row, then hit a key. Ordered to match the
// table's columns so the legend reads left-to-right like the grid does.
// Makes only — a miss is ambiguous from one keystroke and the −/+ / M buttons
// stay the way to enter those, along with FT and PF (PF must also move the
// team-foul count, which is why it deliberately has no shortcut).
const SHORTCUTS: { key: string; kind: BasketballActionKind; label: string }[] = [
  { key: '2', kind: 'FG_MADE', label: 'FGM' },
  { key: '3', kind: '3PT_MADE', label: '3PM' },
  { key: 'O', kind: 'OREB', label: 'OREB' },
  { key: 'D', kind: 'DREB', label: 'DREB' },
  { key: 'A', kind: 'AST', label: 'AST' },
  { key: 'S', kind: 'STL', label: 'STL' },
  { key: 'B', kind: 'BLK', label: 'BLK' },
  { key: 'T', kind: 'TO', label: 'TO' },
];
const SHORTCUT_BY_KEY = new Map(SHORTCUTS.map((s) => [s.key.toLowerCase(), s]));

function emptyPlayer(teamId: string): BasketballPlayer {
  return { teamId, secondsPlayed: 0, pts: 0, ast: 0, reb: 0, oreb: 0, dreb: 0, stl: 0, blk: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, to: 0, pf: 0 };
}

function applyAction(p: BasketballPlayer, kind: BasketballActionKind, dir: 1 | -1): BasketballPlayer {
  const n = { ...p };
  const c = (v: number) => Math.max(0, v);
  switch (kind) {
    // FG_MADE is a 2-point make (fg/fga are TOTAL field goals; 3PT also bumps them).
    case 'FG_MADE': n.fg = c(n.fg + dir); n.fga = c(n.fga + dir); n.pts = c(n.pts + 2 * dir); break;
    case 'FG_MISS': n.fga = c(n.fga + dir); break;
    case '3PT_MADE': n.tp = c(n.tp + dir); n.tpa = c(n.tpa + dir); n.fg = c(n.fg + dir); n.fga = c(n.fga + dir); n.pts = c(n.pts + 3 * dir); break;
    case '3PT_MISS': n.tpa = c(n.tpa + dir); n.fga = c(n.fga + dir); break;
    case 'FT_MADE': n.ft = c(n.ft + dir); n.fta = c(n.fta + dir); n.pts = c(n.pts + dir); break;
    case 'FT_MISS': n.fta = c(n.fta + dir); break;
    case 'AST': n.ast = c(n.ast + dir); break;
    case 'REB': n.reb = c(n.reb + dir); break; // legacy total-only path
    case 'OREB': n.oreb = c(n.oreb + dir); n.reb = c(n.reb + dir); break;
    case 'DREB': n.dreb = c(n.dreb + dir); n.reb = c(n.reb + dir); break;
    case 'STL': n.stl = c(n.stl + dir); break;
    case 'BLK': n.blk = c(n.blk + dir); break;
    case 'TO': n.to = c(n.to + dir); break;
    case 'PF': n.pf = c(n.pf + dir); break;
  }
  return n;
}

// Cap any single elapsed computation. The clock commits every 10s while running,
// so a legitimate delta is ≤~10s; anything larger is a stale timestamp (a reload
// or a throttled/backgrounded tab) and must NOT be credited to the game clock or
// to on-court minutes as though the game kept playing while the tab was away.
const MAX_TICK_SECONDS = 15;
function elapsedSince(startMs: number): number {
  return Math.min(MAX_TICK_SECONDS, Math.max(0, (Date.now() - startMs) / 1000));
}
function liveClock(s: BasketballState): number {
  if (s.clockRunning && s.clockLastStartMs) return s.clockSeconds + elapsedSince(s.clockLastStartMs);
  return s.clockSeconds;
}
function fmtRemaining(elapsed: number, quarterSeconds: number) {
  const r = Math.max(0, Math.floor(quarterSeconds - elapsed));
  return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
}

export default function BasketballMatch({ ctrl }: { ctrl: Ctrl }) {
  const { match, session, updateState, setStatus, saveJerseys } = ctrl;
  const [, force] = useState(0);
  // Jersey check is the first pre-match step: numbers are how a scorer picks a
  // player out on court, so they get confirmed before the starting five, not
  // after. `done` is per-visit — a reload before tip-off shows it again, which
  // is the intended "check" rather than a nag, since saved numbers prefill.
  const [jerseysDone, setJerseysDone] = useState(false);
  const [jerseyOpen, setJerseyOpen] = useState(false);
  // The player a keyboard entry lands on. Clicking anywhere in a row selects it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Transient "what did I just record" confirmation — a scorer's hands are on the
  // keys and their eyes are on the court, so a keystroke must say what it did.
  const [flash, setFlash] = useState<{ text: string; n: number; tone: 'ok' | 'hint' } | null>(null);

  const homeTeam = (session?.roster ?? []).find((t) => t.teamId === match?.homeTeamId);
  const awayTeam = (session?.roster ?? []).find((t) => t.teamId === match?.awayTeamId);
  const state = match?.state as BasketballState | null;
  const quarterSeconds = session?.config?.quarterSeconds ?? 720;

  // Initialize player rows on first open (mirrors server initializeMatchRows).
  useEffect(() => {
    if (!match || match.state || !homeTeam || !awayTeam) return;
    const players: Record<string, BasketballPlayer> = {};
    homeTeam.players.forEach((p) => (players[p.userId] = emptyPlayer(homeTeam.teamId)));
    awayTeam.players.forEach((p) => (players[p.userId] = emptyPlayer(awayTeam.teamId)));
    updateState(() => ({
      quarter: 1, quarterSeconds, clockSeconds: 0, clockRunning: false,
      onCourtHome: [], onCourtAway: [], players, teamFoulsHome: [], teamFoulsAway: [], log: [],
    }));
    void setStatus('IN_PROGRESS');
  }, [match?.id, !!match?.state, homeTeam, awayTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  // On (re)load of a match whose clock was left running, re-anchor clockLastStartMs
  // to now so the time the tab was closed/away is not retroactively credited. The
  // capped delta above is the safety net; this makes the common reload case exact.
  const resynced = useRef(false);
  useEffect(() => {
    if (!state || resynced.current) return;
    resynced.current = true;
    if (state.clockRunning && state.clockLastStartMs && Date.now() - state.clockLastStartMs > MAX_TICK_SECONDS * 1000) {
      updateState((s) => ({ ...(s as BasketballState), clockLastStartMs: Date.now() }));
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // tick + periodic clock commit (credits on-court minutes)
  useEffect(() => {
    if (!state?.clockRunning) return;
    const tick = setInterval(() => force((n) => n + 1), 500);
    const commit = setInterval(() => updateState((s) => commitClock(s as BasketballState)), 10000);
    return () => { clearInterval(tick); clearInterval(commit); };
  }, [state?.clockRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shortcuts are dead while the match is published (read-only) or while a
  // pre-match modal owns the screen — a stray keypress behind a modal must not
  // silently write a stat the scorer can't see happening.
  const preMatch = !!state && state.onCourtHome.length + state.onCourtAway.length === 0;
  const keysBlocked = !state || match?.status === 'PUBLISHED' || preMatch || jerseyOpen;

  // ── Keyboard stat entry ───────────────────────────────────
  // Bound on window rather than a row handler so the keys work no matter where
  // focus ended up after the click. Writes through updateState directly (not
  // adjust()) because adjust is declared below the early returns.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Leave browser/OS chords alone.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Never steal a keystroke aimed at a form control (the sub selects, the
      // starters checkboxes) — typing "s" in a dropdown must jump to an option.
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, select, textarea, [contenteditable="true"]')) return;
      if (e.key === 'Escape') { setSelectedId(null); return; }
      const hit = SHORTCUT_BY_KEY.get(e.key.toLowerCase());
      if (!hit || keysBlocked) return;
      e.preventDefault();
      // A live shortcut with no player armed is the easy mistake to make. Say so
      // rather than swallowing the keystroke and leaving the scorer to wonder
      // whether it landed somewhere.
      if (!selectedId) { setFlash({ text: 'Select a player first', n: Date.now(), tone: 'hint' }); return; }
      updateState((s) => {
        const bs = s as BasketballState;
        const p = bs.players[selectedId];
        if (!p) return bs;
        return {
          ...bs,
          players: { ...bs.players, [selectedId]: applyAction(p, hit.kind, 1) },
          log: [...bs.log, { id: uid(), playerId: selectedId, kind: hit.kind }],
        };
      });
      const who = [...(homeTeam?.players ?? []), ...(awayTeam?.players ?? [])]
        .find((p) => p.userId === selectedId);
      setFlash({ text: `${who?.name ?? 'Player'} +1 ${hit.label}`, n: Date.now(), tone: 'ok' });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, keysBlocked, updateState, homeTeam, awayTeam]);

  // Clear the confirmation after a beat. Keyed on `n` so repeat entries of the
  // same stat restart the timer instead of the pill vanishing mid-run.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  if (!match || !session || !homeTeam || !awayTeam) {
    return <div className="card" style={{ background: '#0f172a' }}>Teams not assigned yet.</div>;
  }
  if (!state) return null;

  const home = homeTeam.teamId, away = awayTeam.teamId;
  const locked = match.status === 'PUBLISHED';
  const onCourt = new Set([...state.onCourtHome, ...state.onCourtAway]);
  const noneOnCourt = onCourt.size === 0;
  // Pre-match order: jerseys first, then the starting five. Reopening jerseys
  // mid-match (the header button) takes precedence over both.
  const showJerseys = jerseyOpen || (noneOnCourt && !jerseysDone);
  const showStarters = noneOnCourt && !showJerseys;

  function commitClock(s: BasketballState): BasketballState {
    if (!s.clockRunning || !s.clockLastStartMs) return s;
    const delta = elapsedSince(s.clockLastStartMs); // capped — never credits away-time
    const players = { ...s.players };
    [...s.onCourtHome, ...s.onCourtAway].forEach((id) => {
      if (players[id]) players[id] = { ...players[id], secondsPlayed: players[id].secondsPlayed + delta };
    });
    return { ...s, clockSeconds: s.clockSeconds + delta, clockLastStartMs: Date.now(), players };
  }
  function adjust(playerId: string, kind: BasketballActionKind, dir: 1 | -1) {
    if (locked) return;
    updateState((s) => {
      const bs = s as BasketballState;
      const p = bs.players[playerId];
      if (!p) return bs;
      return {
        ...bs,
        players: { ...bs.players, [playerId]: applyAction(p, kind, dir) },
        log: dir === 1 ? [...bs.log, { id: uid(), playerId, kind }] : bs.log,
      };
    });
  }
  // A foul updates the player AND the team's per-quarter foul count (bonus tracking).
  function foul(playerId: string, dir: 1 | -1) {
    if (locked) return;
    updateState((s) => {
      const bs = s as BasketballState;
      const p = bs.players[playerId];
      if (!p) return bs;
      const isHome = p.teamId === home;
      const key = isHome ? 'teamFoulsHome' : 'teamFoulsAway';
      return {
        ...bs,
        players: { ...bs.players, [playerId]: applyAction(p, 'PF', dir) },
        [key]: bumpTeamFoul(bs[key], bs.quarter, dir),
        log: dir === 1 ? [...bs.log, { id: uid(), playerId, kind: 'PF' as BasketballActionKind }] : bs.log,
      };
    });
  }
  const clockStart = () => updateState((s) => ({ ...(s as BasketballState), clockRunning: true, clockLastStartMs: Date.now(), startedAt: (s as BasketballState).startedAt ?? Date.now() }));
  const clockStop = () => updateState((s) => ({ ...commitClock(s as BasketballState), clockRunning: false, clockLastStartMs: undefined }));
  const clockReset = () => updateState((s) => ({ ...(s as BasketballState), clockSeconds: 0, clockRunning: false, clockLastStartMs: undefined }));
  const nextQuarter = () => updateState((s) => {
    const c = commitClock(s as BasketballState);
    return { ...c, quarter: c.quarter + 1, clockSeconds: 0, clockRunning: false, clockLastStartMs: undefined };
  });
  function endMatch() {
    if (!confirm('End match? You can still export and publish afterward.')) return;
    updateState((s) => ({ ...commitClock(s as BasketballState), clockRunning: false, clockLastStartMs: undefined }));
    void setStatus('COMPLETED');
  }

  const getTeamName = (id: string) => (id === home ? homeTeam!.name : awayTeam!.name);
  const selectedName = selectedId
    ? [...homeTeam.players, ...awayTeam.players].find((p) => p.userId === selectedId)?.name ?? null
    : null;

  return (
    <div className="bball-tracker">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 40 }}>🏀</span>
          <h2>Live Match: {getTeamName(home)} vs {getTeamName(away)}</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="bball-clock">
              <div className="bball-clock-q">Q{state.quarter}</div>
              <div className="bball-clock-time">{fmtRemaining(liveClock(state), quarterSeconds)}</div>
            </div>
            {!state.clockRunning
              ? <button className="btn secondary" onClick={clockStart} style={{ padding: '6px 10px' }}>Start</button>
              : <button className="btn secondary" onClick={clockStop} style={{ padding: '6px 10px' }}>Stop</button>}
            <button className="btn secondary" onClick={clockReset} style={{ padding: '6px 10px' }}>Reset</button>
            <button className="btn secondary" onClick={nextQuarter} style={{ padding: '6px 10px' }}>Next Q</button>
          </div>
          <SubControls homeTeam={homeTeam} awayTeam={awayTeam} state={state} disabled={locked}
            onSub={(side, outId, inId) => updateState((s) => sub(s as BasketballState, side, outId, inId))}
            onBulkSub={(side, pairs) => updateState((s) => bulkSub(s as BasketballState, side, pairs))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn secondary" onClick={() => setJerseyOpen(true)}>Jersey #s</button>
            <button onClick={endMatch}>End Match</button>
          </div>
        </div>
      </div>

      {showJerseys && (
        <JerseyModal
          persist={saveJerseys}
          homeTeam={homeTeam} awayTeam={awayTeam}
          // Mid-match reopen is a correction, so it can be dismissed. The
          // pre-match pass can be skipped too — unknown numbers must not wall
          // off a game that's about to tip.
          onClose={() => { setJerseyOpen(false); setJerseysDone(true); }}
          onSaved={() => { setJerseyOpen(false); setJerseysDone(true); }}
        />
      )}

      {showStarters && (
        <StartersModal homeTeam={homeTeam} awayTeam={awayTeam}
          onBack={() => setJerseyOpen(true)}
          onSave={(h, a) => updateState((s) => ({ ...(s as BasketballState), onCourtHome: h, onCourtAway: a }))} />
      )}

      <div className="bball-keybar">
        <div className="bball-keybar-who">
          {selectedName
            ? <>Entering for <strong>{selectedName}</strong> <button className="bball-keybar-clear" onClick={() => setSelectedId(null)}>clear (Esc)</button></>
            : <span style={{ color: '#9ca3af' }}>Click a player row, then press a key</span>}
        </div>
        <div className={`bball-keybar-keys${flash ? ' dimmed' : ''}`}>
          {SHORTCUTS.map((s) => (
            <span key={s.key} className="bball-key"><kbd>{s.key}</kbd>{s.label}</span>
          ))}
        </div>
        {/* Overlaid, not inserted, so a confirmation never reflows the legend
            out from under the scorer mid-entry. */}
        {flash && <div className={`bball-keybar-flash ${flash.tone}`} role="status">{flash.text}</div>}
      </div>

      <div className="bball-scroll">
        <table>
          <ColGroup />
          <thead>
            <ColumnHeaderRow />
          </thead>
          <tbody>
            <TeamBlock side="home" teamName={getTeamName(home)} headerBg="#061528" headerColor="#e6eef6"
              team={homeTeam} state={state} disabled={locked} adjust={adjust} foul={foul}
              selectedId={selectedId} onSelect={setSelectedId}
              teamFouls={teamFoulsInQuarter(state.teamFoulsHome, state.quarter)} />
            {/* The away block repeats the column titles under its banner — by the
                time a scorer scrolls to the second team the <thead> is long gone
                off the top, and entering into an unlabelled grid of −/+ buttons
                is how stats land in the wrong column. */}
            <TeamBlock side="away" repeatHeader teamName={getTeamName(away)} headerBg="#24060a" headerColor="#ffe4e6"
              team={awayTeam} state={state} disabled={locked} adjust={adjust} foul={foul}
              selectedId={selectedId} onSelect={setSelectedId}
              teamFouls={teamFoulsInQuarter(state.teamFoulsAway, state.quarter)} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sub(s: BasketballState, side: 'home' | 'away', outId: string, inId: string): BasketballState {
  const key = side === 'home' ? 'onCourtHome' : 'onCourtAway';
  return { ...s, [key]: s[key].map((id) => (id === outId ? inId : id)) };
}

// Bulk substitution: swap several out→in in a single state update. Identical in
// effect to applying `sub` N times at the same instant — the on-court array keeps
// its size, so minutes accrual (commitClock, keyed on array membership) and every
// per-player stat are untouched. Pairing is by index; since the on-court array is
// an unordered five, any valid pairing yields the same final set.
function bulkSub(s: BasketballState, side: 'home' | 'away', pairs: [string, string][]): BasketballState {
  const key = side === 'home' ? 'onCourtHome' : 'onCourtAway';
  const swap = new Map(pairs);
  return { ...s, [key]: s[key].map((id) => swap.get(id) ?? id) };
}

function teamTotals(team: RosterTeam, state: BasketballState) {
  const t = { pts: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0 };
  team.players.forEach((p) => {
    const r = state.players[p.userId]; if (!r) return;
    t.pts += r.pts; t.oreb += r.oreb ?? 0; t.dreb += r.dreb ?? 0; t.ast += r.ast; t.stl += r.stl; t.blk += r.blk;
    t.to += r.to ?? 0; t.pf += r.pf ?? 0;
    t.fg += r.fg; t.fga += r.fga; t.tp += r.tp; t.tpa += r.tpa; t.ft += r.ft; t.fta += r.fta;
  });
  return t;
}

function TeamBlock({ side, teamName, headerBg, headerColor, team, state, disabled, adjust, foul, teamFouls, repeatHeader = false, selectedId, onSelect }: {
  side: 'home' | 'away'; teamName: string; headerBg: string; headerColor: string;
  team: RosterTeam; state: BasketballState; disabled: boolean;
  adjust: (playerId: string, kind: BasketballActionKind, dir: 1 | -1) => void;
  foul: (playerId: string, dir: 1 | -1) => void;
  teamFouls: number;
  /** Re-print the column titles under this team's banner (the <thead> only covers the first block). */
  repeatHeader?: boolean;
  selectedId: string | null;
  onSelect: (playerId: string) => void;
}) {
  const onCourtSet = new Set(side === 'home' ? state.onCourtHome : state.onCourtAway);
  const t = teamTotals(team, state);
  const bonus = teamInBonus(teamFouls);
  const rows = team.players
    .map((p) => ({ ...emptyPlayer(team.teamId), ...state.players[p.userId], userId: p.userId, name: p.name, jersey: p.number, onCourt: onCourtSet.has(p.userId) }))
    .sort((a, b) => Number(b.onCourt) - Number(a.onCourt));

  return (
    <>
      {/* Team header — Sahil's row, with a quiet team-fouls / bonus readout appended. */}
      <tr style={{ background: headerBg, color: headerColor }}>
        {/* inline bg so the sticky first-column rule doesn't override the team banner */}
        <td colSpan={COL_COUNT} style={{ padding: '8px 12px', background: headerBg }}>
          <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <strong style={{ fontSize: 16 }}>{teamName}</strong>
            <span style={{ fontSize: 12, fontWeight: 600, color: bonus ? '#fca5a5' : '#9ca3af' }}>
              Team fouls Q{state.quarter}: {teamFouls}{bonus ? ' · BONUS' : ''}
            </span>
          </span>
        </td>
      </tr>
      {repeatHeader && <ColumnHeaderRow repeat />}
      <tr style={{ background: 'rgba(255,255,255,0.02)', fontWeight: 700, color: '#e6eef6' }}>
        <td>Team Totals</td><td>-</td><td>{t.pts}</td><td>{t.oreb}</td><td>{t.dreb}</td><td>{t.ast}</td><td>{t.stl}</td><td>{t.blk}</td><td>{t.to}</td><td>{t.pf}</td>
        <td>{t.fg} / {t.fga}</td><td>{t.tp} / {t.tpa}</td><td>{t.ft} / {t.fta}</td>
      </tr>
      {rows.map((r) => {
        const fouledOut = isFouledOut(r.pf ?? 0);
        const selected = r.userId === selectedId;
        return (
        // Clicking anywhere in the row — including on a −/+ button — arms this
        // player for keyboard entry, which is what a scorer means by "I'm on
        // this player now". Keys are handled on window, not here.
        <tr key={r.userId} className={selected ? 'bball-row-sel' : undefined}
          onClick={() => onSelect(r.userId)}
          aria-selected={selected}
          style={{ borderTop: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
          {/* Name truncates, badges never do — under a fixed layout the status
              flags are what a scorer scans for, so they hold their width. */}
          <td className="pcell">
            <span className="pcell-in">
              <span className="pnum">#{r.jersey ?? '-'}</span>
              <span className="pname" title={r.name}>{r.name}</span>
              {r.onCourt ? <span className="badge-on">ON</span> : <span className="badge-bench">BENCH</span>}
              {fouledOut && <span className="badge-bench badge-out">OUT</span>}
            </span>
          </td>
          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{(r.secondsPlayed / 60).toFixed(1)}</td>
          <td>{r.pts}</td>
          <Counter v={r.oreb ?? 0} onMinus={() => adjust(r.userId, 'OREB', -1)} onPlus={() => adjust(r.userId, 'OREB', 1)} disabled={disabled} />
          <Counter v={r.dreb ?? 0} onMinus={() => adjust(r.userId, 'DREB', -1)} onPlus={() => adjust(r.userId, 'DREB', 1)} disabled={disabled} />
          <Counter v={r.ast} onMinus={() => adjust(r.userId, 'AST', -1)} onPlus={() => adjust(r.userId, 'AST', 1)} disabled={disabled} />
          <Counter v={r.stl} onMinus={() => adjust(r.userId, 'STL', -1)} onPlus={() => adjust(r.userId, 'STL', 1)} disabled={disabled} />
          <Counter v={r.blk} onMinus={() => adjust(r.userId, 'BLK', -1)} onPlus={() => adjust(r.userId, 'BLK', 1)} disabled={disabled} />
          <Counter v={r.to ?? 0} onMinus={() => adjust(r.userId, 'TO', -1)} onPlus={() => adjust(r.userId, 'TO', 1)} disabled={disabled} />
          <FoulCell v={r.pf ?? 0} onMinus={() => foul(r.userId, -1)} onPlus={() => foul(r.userId, 1)} disabled={disabled} />
          <ShotCell made={r.fg} att={r.fga} kind="FG_MADE" missKind="FG_MISS" pid={r.userId} adjust={adjust} disabled={disabled} />
          <ShotCell made={r.tp} att={r.tpa} kind="3PT_MADE" missKind="3PT_MISS" pid={r.userId} adjust={adjust} disabled={disabled} />
          <ShotCell made={r.ft} att={r.fta} kind="FT_MADE" missKind="FT_MISS" pid={r.userId} adjust={adjust} disabled={disabled} />
        </tr>
        );
      })}
    </>
  );
}

function Counter({ v, onMinus, onPlus, disabled }: { v: number; onMinus: () => void; onPlus: () => void; disabled: boolean }) {
  return (
    <td>
      <span className="cnt">
        <button onClick={onMinus} disabled={disabled}>-</button>
        <span className="v">{v}</span>
        <button onClick={onPlus} disabled={disabled}>+</button>
      </span>
    </td>
  );
}

// Personal fouls — colours as the player nears (amber) and reaches (red) the limit.
function FoulCell({ v, onMinus, onPlus, disabled }: { v: number; onMinus: () => void; onPlus: () => void; disabled: boolean }) {
  const out = isFouledOut(v);
  const trouble = inFoulTrouble(v);
  const color = out ? '#f87171' : trouble ? '#fbbf24' : undefined;
  return (
    <td>
      <span className="cnt">
        <button onClick={onMinus} disabled={disabled}>-</button>
        <span className="v" style={{ color, fontWeight: out || trouble ? 700 : undefined }} title={out ? `Fouled out (${FOUL_OUT_LIMIT})` : undefined}>{v}</span>
        <button onClick={onPlus} disabled={disabled}>+</button>
      </span>
    </td>
  );
}

function ShotCell({ made, att, kind, missKind, pid, adjust, disabled }: {
  made: number; att: number; kind: BasketballActionKind; missKind: BasketballActionKind;
  pid: string; adjust: (p: string, k: BasketballActionKind, d: 1 | -1) => void; disabled: boolean;
}) {
  return (
    <td>
      <span className="shot">
        <span className="shot-grp">
          <button className="sb-mk-minus" title="Remove make" disabled={disabled} onClick={() => adjust(pid, kind, -1)}>−</button>
          <button className="sb-mk-plus" title="Add make" disabled={disabled} onClick={() => adjust(pid, kind, 1)}>+</button>
        </span>
        <span className="shot-v">{made} / {att}</span>
        <span className="shot-grp">
          <button className="sb-ms-minus" title="Remove miss" disabled={disabled} onClick={() => adjust(pid, missKind, -1)}>−</button>
          <button className="sb-ms-plus" title="Add miss" disabled={disabled} onClick={() => adjust(pid, missKind, 1)}>M</button>
        </span>
      </span>
    </td>
  );
}

// One coming-off / coming-on chip. Tap to toggle; red = pulling, green = sending on.
function SubChip({ label, selected, tone, disabled, onClick }: {
  label: string; selected: boolean; tone: 'out' | 'in'; disabled: boolean; onClick: () => void;
}) {
  const hue = tone === 'out' ? '248,113,113' : '74,222,128';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '3px 8px', borderRadius: 999, fontSize: 12, lineHeight: 1.3, cursor: disabled ? 'default' : 'pointer',
        whiteSpace: 'nowrap', fontWeight: selected ? 700 : 500,
        color: selected ? '#fff' : '#cbd5e1',
        border: `1px solid ${selected ? `rgb(${hue})` : 'rgba(255,255,255,0.15)'}`,
        background: selected ? `rgba(${hue},0.18)` : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

function SubControls({ homeTeam, awayTeam, state, disabled, onSub, onBulkSub }: {
  homeTeam: RosterTeam; awayTeam: RosterTeam; state: BasketballState; disabled: boolean;
  onSub: (side: 'home' | 'away', outId: string, inId: string) => void;
  onBulkSub: (side: 'home' | 'away', pairs: [string, string][]) => void;
}) {
  const [subTeam, setSubTeam] = useState<'home' | 'away'>('home');
  const [out, setOut] = useState('');
  const [inn, setInn] = useState('');
  // Bulk selection: players tapped to come off / come on this round.
  const [offIds, setOffIds] = useState<Set<string>>(new Set());
  const [onIds, setOnIds] = useState<Set<string>>(new Set());
  const team = subTeam === 'home' ? homeTeam : awayTeam;
  const onCourtIds = subTeam === 'home' ? state.onCourtHome : state.onCourtAway;
  const onCourt = team.players.filter((p) => onCourtIds.includes(p.userId));
  const bench = team.players.filter((p) => !onCourtIds.includes(p.userId));

  const clearBulk = () => { setOffIds(new Set()); setOnIds(new Set()); };
  const toggle = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setFn((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const short = (name: string) => name.split(' ')[0];
  const balanced = offIds.size > 0 && offIds.size === onIds.size;

  const applyBulk = () => {
    // Pair off→on by selection order; the final on-court set is identical regardless.
    const offs = [...offIds], ons = [...onIds];
    onBulkSub(subTeam, offs.map((o, i) => [o, ons[i]] as [string, string]));
    clearBulk();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      {/* Single sub — unchanged. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select value={subTeam} onChange={(e) => { setSubTeam(e.target.value as 'home' | 'away'); setOut(''); setInn(''); clearBulk(); }}>
          <option value="home">{homeTeam.name}</option>
          <option value="away">{awayTeam.name}</option>
        </select>
        <select value={out} onChange={(e) => setOut(e.target.value)}>
          <option value="">Out</option>
          {onCourt.map((p) => <option key={p.userId} value={p.userId}>#{p.number ?? '-'} {p.name}</option>)}
        </select>
        <select value={inn} onChange={(e) => setInn(e.target.value)}>
          <option value="">In</option>
          {bench.map((p) => <option key={p.userId} value={p.userId}>#{p.number ?? '-'} {p.name}</option>)}
        </select>
        <button className="btn secondary" disabled={disabled || !out || !inn} onClick={() => { onSub(subTeam, out, inn); setOut(''); setInn(''); }}>Sub</button>
      </div>

      {/* Bulk sub — tap several off + several on, one press. Same team as above. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 640 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171' }}>OFF</span>
        {onCourt.map((p) => (
          <SubChip key={p.userId} tone="out" disabled={disabled} selected={offIds.has(p.userId)}
            onClick={() => toggle(setOffIds, p.userId)} label={`#${p.number ?? '-'} ${short(p.name)}`} />
        ))}
        <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', marginLeft: 4 }}>ON</span>
        {bench.map((p) => (
          <SubChip key={p.userId} tone="in" disabled={disabled} selected={onIds.has(p.userId)}
            onClick={() => toggle(setOnIds, p.userId)} label={`#${p.number ?? '-'} ${short(p.name)}`} />
        ))}
        <button className="btn" disabled={disabled || !balanced} onClick={applyBulk} title="Swap all selected at once"
          style={{ padding: '4px 10px' }}>
          {offIds.size || onIds.size ? `Sub ${offIds.size} ⇄ ${onIds.size}` : 'Bulk sub'}
        </button>
      </div>
    </div>
  );
}

/** One team's column of number inputs. Declared at module scope on purpose — a
 *  component defined inside JerseyModal would be a new type every render, so
 *  React would remount these inputs and the field would lose focus after each
 *  keystroke. */
function JerseyCol({ team, draft, clashing, setNum }: {
  team: RosterTeam; draft: Record<string, string>; clashing: Set<string>;
  setNum: (userId: string, raw: string) => void;
}) {
  return (
    <div className="card" style={{ minHeight: 0 }}>
      <strong>{team.name}</strong>
      <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
        {team.players.map((p) => (
          <label key={p.userId} className="jersey-row">
            <input
              className={`jersey-input${clashing.has(p.userId) ? ' bad' : ''}`}
              value={draft[p.userId] ?? ''}
              onChange={(e) => setNum(p.userId, e.target.value)}
              inputMode="numeric" maxLength={2} placeholder="–"
              aria-label={`Jersey number for ${p.name}`}
              aria-invalid={clashing.has(p.userId)}
            />
            <span className="jersey-name">{p.name}</span>
            <span style={{ color: '#9ca3af', fontSize: 12 }}>{p.position ?? '—'}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Pre-match jersey check. Prefilled from the saved roster, so the common case
 *  is a glance and Save; a first run is data entry. Numbers persist on the
 *  session roster, not the match, so they carry to every later fixture. */
function JerseyModal({ persist, homeTeam, awayTeam, onSaved, onClose }: {
  persist: (numbers: JerseyEdit[]) => Promise<RosterTeam[]>;
  homeTeam: RosterTeam; awayTeam: RosterTeam;
  onSaved: () => void; onClose: () => void;
}) {
  const all = [...homeTeam.players, ...awayTeam.players];
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(all.map((p) => [p.userId, p.number == null ? '' : String(p.number)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A number repeated inside ONE team is the failure that matters — it makes the
  // scorer's shorthand ambiguous. The same number across opposing teams is
  // normal and is left alone.
  const clashing = new Set<string>();
  for (const team of [homeTeam, awayTeam]) {
    const byNumber = new Map<string, string[]>();
    for (const p of team.players) {
      const v = (draft[p.userId] ?? '').trim();
      if (!v) continue;
      byNumber.set(v, [...(byNumber.get(v) ?? []), p.userId]);
    }
    for (const ids of byNumber.values()) if (ids.length > 1) ids.forEach((id) => clashing.add(id));
  }

  const setNum = (userId: string, raw: string) => {
    // Digits only, max two — matches what the server accepts (0–99).
    const v = raw.replace(/\D/g, '').slice(0, 2);
    setDraft((d) => ({ ...d, [userId]: v }));
    setError(null);
  };

  async function save() {
    if (clashing.size) { setError('Two players on the same team share a number — fix the highlighted rows.'); return; }
    setSaving(true);
    setError(null);
    try {
      const numbers = all.map((p) => {
        const v = (draft[p.userId] ?? '').trim();
        return { userId: p.userId, number: v === '' ? null : Number(v) };
      });
      await persist(numbers);
      onSaved();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg || 'Could not save jersey numbers. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  const filled = all.filter((p) => (draft[p.userId] ?? '').trim() !== '').length;

  return (
    <div className="bball-modal-backdrop">
      <div className="bball-modal" style={{ width: 720, maxWidth: '92vw' }}>
        <h3 style={{ marginTop: 0 }}>Jersey Numbers</h3>
        <div style={{ color: '#9ca3af', marginTop: 4 }}>
          Check or add each player's number, then save. Leave blank if unknown — you can
          come back to this any time with the <strong>Jersey #s</strong> button.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <JerseyCol team={homeTeam} draft={draft} clashing={clashing} setNum={setNum} />
          <JerseyCol team={awayTeam} draft={draft} clashing={clashing} setNum={setNum} />
        </div>
        {error && <div className="jersey-error" role="alert">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <span style={{ color: '#9ca3af', fontSize: 12 }}>{filled} of {all.length} numbered</span>
          <span style={{ display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>Skip for now</button>
            <button className="btn" onClick={save} disabled={saving || clashing.size > 0}>
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function StartersModal({ homeTeam, awayTeam, onSave, onBack }: {
  homeTeam: RosterTeam; awayTeam: RosterTeam; onSave: (home: string[], away: string[]) => void;
  onBack: () => void;
}) {
  const needH = Math.min(5, homeTeam.players.length);
  const needA = Math.min(5, awayTeam.players.length);
  const [h, setH] = useState<string[]>([]);
  const [a, setA] = useState<string[]>([]);
  const toggle = (arr: string[], set: (v: string[]) => void, need: number, id: string) => {
    if (arr.includes(id)) set(arr.filter((x) => x !== id));
    else if (arr.length < need) set([...arr, id]);
  };

  const Col = ({ team, sel, set, need }: { team: RosterTeam; sel: string[]; set: (v: string[]) => void; need: number }) => (
    <div className="card" style={{ minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{team.name}</strong>
        <span style={{ color: sel.length === need ? '#22c55e' : '#f59e0b' }}>{sel.length}/{need}</span>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        {team.players.map((p) => (
          <label key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={sel.includes(p.userId)}
              onChange={() => toggle(sel, set, need, p.userId)}
              disabled={!sel.includes(p.userId) && sel.length >= need} />
            <span><strong>#{p.number ?? '-'}</strong> {p.name} <span style={{ color: '#9ca3af' }}>({p.position ?? '—'})</span></span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bball-modal-backdrop">
      <div className="bball-modal" style={{ width: 720, maxWidth: '92vw' }}>
        <h3 style={{ marginTop: 0 }}>Set Starting 5</h3>
        <div style={{ color: '#9ca3af', marginTop: 4 }}>
          Select {needH === 5 ? '5' : needH} players for each team. Use Quick Sub to swap ON/BENCH during the game.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <Col team={homeTeam} sel={h} set={setH} need={needH} />
          <Col team={awayTeam} sel={a} set={setA} need={needA} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <button className="btn secondary" onClick={onBack}>← Jersey numbers</button>
          <span style={{ display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={() => { if (!h.length) setH(homeTeam.players.slice(0, needH).map((p) => p.userId)); if (!a.length) setA(awayTeam.players.slice(0, needA).map((p) => p.userId)); }}>
              Auto-pick first {needH}
            </button>
            <button className="btn" disabled={h.length !== needH || a.length !== needA} onClick={() => onSave(h, a)}>Save Starters</button>
          </span>
        </div>
      </div>
    </div>
  );
}

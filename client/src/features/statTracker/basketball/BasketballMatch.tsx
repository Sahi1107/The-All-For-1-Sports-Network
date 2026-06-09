import { useEffect, useState } from 'react';
import './tracker.css';
import type { useTrackerMatch } from '../useTrackerMatch';
import type {
  BasketballState, BasketballPlayer, BasketballActionKind, RosterTeam,
} from '../types';

type Ctrl = ReturnType<typeof useTrackerMatch>;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

function emptyPlayer(teamId: string): BasketballPlayer {
  return { teamId, secondsPlayed: 0, pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, to: 0 };
}

function applyAction(p: BasketballPlayer, kind: BasketballActionKind, dir: 1 | -1): BasketballPlayer {
  const n = { ...p };
  const c = (v: number) => Math.max(0, v);
  switch (kind) {
    case 'FG_MADE': n.fg = c(n.fg + dir); n.fga = c(n.fga + dir); n.pts = c(n.pts + 2 * dir); break;
    case 'FG_MISS': n.fga = c(n.fga + dir); break;
    case '3PT_MADE': n.tp = c(n.tp + dir); n.tpa = c(n.tpa + dir); n.fg = c(n.fg + dir); n.fga = c(n.fga + dir); n.pts = c(n.pts + 3 * dir); break;
    case '3PT_MISS': n.tpa = c(n.tpa + dir); n.fga = c(n.fga + dir); break;
    case 'FT_MADE': n.ft = c(n.ft + dir); n.fta = c(n.fta + dir); n.pts = c(n.pts + dir); break;
    case 'FT_MISS': n.fta = c(n.fta + dir); break;
    case 'AST': n.ast = c(n.ast + dir); break;
    case 'REB': n.reb = c(n.reb + dir); break;
    case 'STL': n.stl = c(n.stl + dir); break;
    case 'BLK': n.blk = c(n.blk + dir); break;
    case 'TO': n.to = c(n.to + dir); break;
  }
  return n;
}

function liveClock(s: BasketballState): number {
  if (s.clockRunning && s.clockLastStartMs) return s.clockSeconds + (Date.now() - s.clockLastStartMs) / 1000;
  return s.clockSeconds;
}
function fmtRemaining(elapsed: number, quarterSeconds: number) {
  const r = Math.max(0, Math.floor(quarterSeconds - elapsed));
  return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
}
function pct(made?: number, att?: number) {
  if (!att) return '—';
  return (((made || 0) / att) * 100).toFixed(0) + '%';
}

export default function BasketballMatch({ ctrl }: { ctrl: Ctrl }) {
  const { match, session, updateState, setStatus } = ctrl;
  const [, force] = useState(0);

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
      onCourtHome: [], onCourtAway: [], players, log: [],
    }));
    void setStatus('IN_PROGRESS');
  }, [match?.id, !!match?.state, homeTeam, awayTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  // tick + periodic clock commit (credits on-court minutes)
  useEffect(() => {
    if (!state?.clockRunning) return;
    const tick = setInterval(() => force((n) => n + 1), 500);
    const commit = setInterval(() => updateState((s) => commitClock(s as BasketballState)), 10000);
    return () => { clearInterval(tick); clearInterval(commit); };
  }, [state?.clockRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!match || !session || !homeTeam || !awayTeam) {
    return <div className="card" style={{ background: '#0f172a' }}>Teams not assigned yet.</div>;
  }
  if (!state) return null;

  const home = homeTeam.teamId, away = awayTeam.teamId;
  const locked = match.status === 'PUBLISHED';
  const onCourt = new Set([...state.onCourtHome, ...state.onCourtAway]);
  const noneOnCourt = onCourt.size === 0;

  function commitClock(s: BasketballState): BasketballState {
    if (!s.clockRunning || !s.clockLastStartMs) return s;
    const delta = (Date.now() - s.clockLastStartMs) / 1000;
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
            onSub={(side, outId, inId) => updateState((s) => sub(s as BasketballState, side, outId, inId))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={endMatch}>End Match</button>
          </div>
        </div>
      </div>

      {noneOnCourt && (
        <StartersModal homeTeam={homeTeam} awayTeam={awayTeam}
          onSave={(h, a) => updateState((s) => ({ ...(s as BasketballState), onCourtHome: h, onCourtAway: a }))} />
      )}

      <div className="bball-scroll">
        <table>
          <thead>
            <tr>
              <th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th>
              <th>FGM / FGA</th><th>FG%</th><th>3PM / 3PA</th><th>3P%</th><th>FTM / FTA</th><th>FT%</th>
            </tr>
          </thead>
          <tbody>
            <TeamBlock side="home" teamName={getTeamName(home)} headerBg="#061528" headerColor="#e6eef6"
              team={homeTeam} state={state} disabled={locked} adjust={adjust} />
            <TeamBlock side="away" teamName={getTeamName(away)} headerBg="#24060a" headerColor="#ffe4e6"
              team={awayTeam} state={state} disabled={locked} adjust={adjust} />
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

function teamTotals(team: RosterTeam, state: BasketballState) {
  const t = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0 };
  team.players.forEach((p) => {
    const r = state.players[p.userId]; if (!r) return;
    t.pts += r.pts; t.reb += r.reb; t.ast += r.ast; t.stl += r.stl; t.blk += r.blk;
    t.fg += r.fg; t.fga += r.fga; t.tp += r.tp; t.tpa += r.tpa; t.ft += r.ft; t.fta += r.fta;
  });
  return t;
}

function TeamBlock({ side, teamName, headerBg, headerColor, team, state, disabled, adjust }: {
  side: 'home' | 'away'; teamName: string; headerBg: string; headerColor: string;
  team: RosterTeam; state: BasketballState; disabled: boolean;
  adjust: (playerId: string, kind: BasketballActionKind, dir: 1 | -1) => void;
}) {
  const onCourtSet = new Set(side === 'home' ? state.onCourtHome : state.onCourtAway);
  const t = teamTotals(team, state);
  const rows = team.players
    .map((p) => ({ ...emptyPlayer(team.teamId), ...state.players[p.userId], userId: p.userId, name: p.name, jersey: p.number, onCourt: onCourtSet.has(p.userId) }))
    .sort((a, b) => Number(b.onCourt) - Number(a.onCourt));

  return (
    <>
      <tr style={{ background: headerBg, color: headerColor }}>
        <td colSpan={13} style={{ padding: '8px 12px' }}><strong style={{ fontSize: 16 }}>{teamName}</strong></td>
      </tr>
      <tr style={{ background: 'rgba(255,255,255,0.02)', fontWeight: 700, color: '#e6eef6' }}>
        <td>Team Totals</td><td>-</td><td>{t.pts}</td><td>{t.reb}</td><td>{t.ast}</td><td>{t.stl}</td><td>{t.blk}</td>
        <td>{t.fg} / {t.fga}</td><td>{pct(t.fg, t.fga)}</td><td>{t.tp} / {t.tpa}</td><td>{pct(t.tp, t.tpa)}</td>
        <td>{t.ft} / {t.fta}</td><td>{pct(t.ft, t.fta)}</td>
      </tr>
      {rows.map((r) => (
        <tr key={r.userId} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
          <td>
            #{r.jersey ?? '-'} {r.name}
            {r.onCourt ? <span className="badge-on">ON</span> : <span className="badge-bench">BENCH</span>}
          </td>
          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{(r.secondsPlayed / 60).toFixed(1)}</td>
          <td>{r.pts}</td>
          <Counter v={r.reb} onMinus={() => adjust(r.userId, 'REB', -1)} onPlus={() => adjust(r.userId, 'REB', 1)} disabled={disabled} />
          <Counter v={r.ast} onMinus={() => adjust(r.userId, 'AST', -1)} onPlus={() => adjust(r.userId, 'AST', 1)} disabled={disabled} />
          <Counter v={r.stl} onMinus={() => adjust(r.userId, 'STL', -1)} onPlus={() => adjust(r.userId, 'STL', 1)} disabled={disabled} />
          <Counter v={r.blk} onMinus={() => adjust(r.userId, 'BLK', -1)} onPlus={() => adjust(r.userId, 'BLK', 1)} disabled={disabled} />
          <ShotCell made={r.fg} att={r.fga} kind="FG_MADE" missKind="FG_MISS" pid={r.userId} adjust={adjust} disabled={disabled} />
          <td>{pct(r.fg, r.fga)}</td>
          <ShotCell made={r.tp} att={r.tpa} kind="3PT_MADE" missKind="3PT_MISS" pid={r.userId} adjust={adjust} disabled={disabled} />
          <td>{pct(r.tp, r.tpa)}</td>
          <ShotCell made={r.ft} att={r.fta} kind="FT_MADE" missKind="FT_MISS" pid={r.userId} adjust={adjust} disabled={disabled} />
          <td>{pct(r.ft, r.fta)}</td>
        </tr>
      ))}
    </>
  );
}

function Counter({ v, onMinus, onPlus, disabled }: { v: number; onMinus: () => void; onPlus: () => void; disabled: boolean }) {
  return (
    <td>
      <button onClick={onMinus} disabled={disabled}>-</button>
      {' '}{v}{' '}
      <button onClick={onPlus} disabled={disabled}>+</button>
    </td>
  );
}

function ShotCell({ made, att, kind, missKind, pid, adjust, disabled }: {
  made: number; att: number; kind: BasketballActionKind; missKind: BasketballActionKind;
  pid: string; adjust: (p: string, k: BasketballActionKind, d: 1 | -1) => void; disabled: boolean;
}) {
  return (
    <td>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button title="Remove make" disabled={disabled} onClick={() => adjust(pid, kind, -1)} style={{ background: '#ef4444' }}>−</button>
          <button title="Add make" disabled={disabled} onClick={() => adjust(pid, kind, 1)} style={{ background: '#10b981' }}>+</button>
        </div>
        <div style={{ padding: '0 8px' }}>{made} / {att}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button title="Remove miss" disabled={disabled} onClick={() => adjust(pid, missKind, -1)} style={{ background: '#b91c1c' }}>−</button>
          <button title="Add miss" disabled={disabled} onClick={() => adjust(pid, missKind, 1)} style={{ background: '#065f46' }}>M</button>
        </div>
      </div>
    </td>
  );
}

function SubControls({ homeTeam, awayTeam, state, disabled, onSub }: {
  homeTeam: RosterTeam; awayTeam: RosterTeam; state: BasketballState; disabled: boolean;
  onSub: (side: 'home' | 'away', outId: string, inId: string) => void;
}) {
  const [subTeam, setSubTeam] = useState<'home' | 'away'>('home');
  const [out, setOut] = useState('');
  const [inn, setInn] = useState('');
  const team = subTeam === 'home' ? homeTeam : awayTeam;
  const onCourtIds = subTeam === 'home' ? state.onCourtHome : state.onCourtAway;
  const onCourt = team.players.filter((p) => onCourtIds.includes(p.userId));
  const bench = team.players.filter((p) => !onCourtIds.includes(p.userId));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select value={subTeam} onChange={(e) => { setSubTeam(e.target.value as 'home' | 'away'); setOut(''); setInn(''); }}>
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
  );
}

function StartersModal({ homeTeam, awayTeam, onSave }: {
  homeTeam: RosterTeam; awayTeam: RosterTeam; onSave: (home: string[], away: string[]) => void;
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button className="btn secondary" onClick={() => { if (!h.length) setH(homeTeam.players.slice(0, needH).map((p) => p.userId)); if (!a.length) setA(awayTeam.players.slice(0, needA).map((p) => p.userId)); }}>
            Auto-pick first {needH}
          </button>
          <button className="btn" disabled={h.length !== needH || a.length !== needA} onClick={() => onSave(h, a)}>Save Starters</button>
        </div>
      </div>
    </div>
  );
}

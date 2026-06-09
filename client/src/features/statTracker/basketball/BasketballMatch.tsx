import { useEffect, useMemo, useState } from 'react';
import type { useTrackerMatch } from '../useTrackerMatch';
import type {
  BasketballState, BasketballPlayer, BasketballActionKind, RosterTeam,
} from '../types';

type Ctrl = ReturnType<typeof useTrackerMatch>;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const ACTIONS: { kind: BasketballActionKind; label: string; tone: string }[] = [
  { kind: 'FG_MADE', label: '2 ✓', tone: 'good' },
  { kind: 'FG_MISS', label: '2 ✗', tone: 'bad' },
  { kind: '3PT_MADE', label: '3 ✓', tone: 'good' },
  { kind: '3PT_MISS', label: '3 ✗', tone: 'bad' },
  { kind: 'FT_MADE', label: 'FT ✓', tone: 'good' },
  { kind: 'FT_MISS', label: 'FT ✗', tone: 'bad' },
  { kind: 'AST', label: 'AST', tone: 'neutral' },
  { kind: 'REB', label: 'REB', tone: 'neutral' },
  { kind: 'STL', label: 'STL', tone: 'neutral' },
  { kind: 'BLK', label: 'BLK', tone: 'neutral' },
  { kind: 'TO', label: 'TO', tone: 'bad' },
];

function emptyPlayer(teamId: string): BasketballPlayer {
  return { teamId, secondsPlayed: 0, pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, to: 0 };
}

function applyAction(p: BasketballPlayer, kind: BasketballActionKind, dir: 1 | -1): BasketballPlayer {
  const n = { ...p };
  const clamp = (v: number) => Math.max(0, v);
  switch (kind) {
    case 'FG_MADE': n.fg = clamp(n.fg + dir); n.fga = clamp(n.fga + dir); n.pts = clamp(n.pts + 2 * dir); break;
    case 'FG_MISS': n.fga = clamp(n.fga + dir); break;
    case '3PT_MADE': n.tp = clamp(n.tp + dir); n.tpa = clamp(n.tpa + dir); n.fg = clamp(n.fg + dir); n.fga = clamp(n.fga + dir); n.pts = clamp(n.pts + 3 * dir); break;
    case '3PT_MISS': n.tpa = clamp(n.tpa + dir); n.fga = clamp(n.fga + dir); break;
    case 'FT_MADE': n.ft = clamp(n.ft + dir); n.fta = clamp(n.fta + dir); n.pts = clamp(n.pts + dir); break;
    case 'FT_MISS': n.fta = clamp(n.fta + dir); break;
    case 'AST': n.ast = clamp(n.ast + dir); break;
    case 'REB': n.reb = clamp(n.reb + dir); break;
    case 'STL': n.stl = clamp(n.stl + dir); break;
    case 'BLK': n.blk = clamp(n.blk + dir); break;
    case 'TO': n.to = clamp(n.to + dir); break;
  }
  return n;
}

const fmt = (sec: number) => {
  const t = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
function liveClock(s: BasketballState): number {
  if (s.clockRunning && s.clockLastStartMs) return s.clockSeconds + (Date.now() - s.clockLastStartMs) / 1000;
  return s.clockSeconds;
}

export default function BasketballMatch({ ctrl }: { ctrl: Ctrl }) {
  const { match, session, updateState, setStatus } = ctrl;
  const [, force] = useState(0);

  const homeTeam = useMemo(() => (session?.roster ?? []).find((t) => t.teamId === match?.homeTeamId), [session, match?.homeTeamId]);
  const awayTeam = useMemo(() => (session?.roster ?? []).find((t) => t.teamId === match?.awayTeamId), [session, match?.awayTeamId]);
  const state = match?.state as BasketballState | null;
  const quarterSeconds = session?.config?.quarterSeconds ?? 720;

  useEffect(() => {
    if (!state?.clockRunning) return;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [state?.clockRunning]);

  // periodic clock commit (also credits on-court minutes)
  useEffect(() => {
    if (!state?.clockRunning) return;
    const id = setInterval(() => updateState((s) => commitClock(s as BasketballState)), 10000);
    return () => clearInterval(id);
  }, [state?.clockRunning, updateState]);

  if (!match || !session || !homeTeam || !awayTeam) {
    return <div className="bg-dark-light rounded-xl border border-dark-lighter p-6 text-sm text-gray-custom">Teams not assigned yet.</div>;
  }

  // ── Init state ──
  if (!state) {
    return (
      <div className="bg-dark-light rounded-xl border border-dark-lighter p-6 text-center">
        <p className="text-sm text-gray-custom mb-4">Ready to start {homeTeam.name} vs {awayTeam.name}.</p>
        <button
          onClick={() => {
            const players: Record<string, BasketballPlayer> = {};
            homeTeam.players.forEach((p) => (players[p.userId] = emptyPlayer(homeTeam.teamId)));
            awayTeam.players.forEach((p) => (players[p.userId] = emptyPlayer(awayTeam.teamId)));
            const init: BasketballState = {
              quarter: 1, quarterSeconds, clockSeconds: 0, clockRunning: false,
              onCourtHome: homeTeam.players.slice(0, 5).map((p) => p.userId),
              onCourtAway: awayTeam.players.slice(0, 5).map((p) => p.userId),
              players, log: [],
            };
            updateState(() => init);
            void setStatus('IN_PROGRESS');
          }}
          className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg text-sm"
        >
          Start game
        </button>
      </div>
    );
  }

  const matchEnded = match.status === 'COMPLETED' || match.status === 'PUBLISHED';
  const clock = liveClock(state);

  function commitClock(s: BasketballState): BasketballState {
    if (!s.clockRunning || !s.clockLastStartMs) return s;
    const delta = (Date.now() - s.clockLastStartMs) / 1000;
    const players = { ...s.players };
    [...s.onCourtHome, ...s.onCourtAway].forEach((id) => {
      if (players[id]) players[id] = { ...players[id], secondsPlayed: players[id].secondsPlayed + delta };
    });
    return { ...s, clockSeconds: s.clockSeconds + delta, clockLastStartMs: Date.now(), players };
  }

  function act(playerId: string, kind: BasketballActionKind) {
    if (matchEnded) return;
    updateState((s) => {
      const bs = s as BasketballState;
      const p = bs.players[playerId];
      if (!p) return bs;
      return { ...bs, players: { ...bs.players, [playerId]: applyAction(p, kind, 1) }, log: [...bs.log, { id: uid(), playerId, kind }] };
    });
  }
  function undo() {
    updateState((s) => {
      const bs = s as BasketballState;
      const last = bs.log[bs.log.length - 1];
      if (!last) return bs;
      const p = bs.players[last.playerId];
      const players = p ? { ...bs.players, [last.playerId]: applyAction(p, last.kind, -1) } : bs.players;
      return { ...bs, players, log: bs.log.slice(0, -1) };
    });
  }
  function startStop() {
    updateState((s) => {
      const bs = s as BasketballState;
      if (bs.clockRunning) return { ...commitClock(bs), clockRunning: false, clockLastStartMs: undefined };
      return { ...bs, clockRunning: true, clockLastStartMs: Date.now() };
    });
  }
  function nextQuarter() {
    if (!confirm('Advance to next quarter?')) return;
    updateState((s) => {
      const c = commitClock(s as BasketballState);
      return { ...c, quarter: c.quarter + 1, clockSeconds: 0, clockRunning: false, clockLastStartMs: undefined };
    });
  }
  function endGame() {
    if (!confirm('End game? You can still publish and export afterward.')) return;
    updateState((s) => ({ ...commitClock(s as BasketballState), clockRunning: false, clockLastStartMs: undefined }));
    void setStatus('COMPLETED');
  }

  return (
    <div className="space-y-4">
      <div className="bg-dark-light rounded-xl border border-dark-lighter p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="text-right truncate font-semibold">{homeTeam.name}</div>
          <div className="flex flex-col items-center">
            <div className="text-4xl font-mono font-bold tabular-nums">{match.homeScore}<span className="text-gray-custom mx-2">–</span>{match.awayScore}</div>
            <div className="text-sm font-mono text-primary-light mt-1">Q{state.quarter} · {fmt(clock)} / {fmt(quarterSeconds)}</div>
          </div>
          <div className="text-left truncate font-semibold">{awayTeam.name}</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {!matchEnded && (
            <>
              <Btn primary={!state.clockRunning} onClick={startStop}>{state.clockRunning ? '⏸ Stop clock' : '▶ Start clock'}</Btn>
              <Btn onClick={nextQuarter}>Next quarter</Btn>
              <Btn onClick={undo}>↶ Undo</Btn>
              <Btn danger onClick={endGame}>End game</Btn>
            </>
          )}
          {matchEnded && <span className="text-xs px-3 py-1 rounded-full bg-primary/20 text-primary-light">Final</span>}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {[homeTeam, awayTeam].map((team) => (
          <TeamBox key={team.teamId} team={team} state={state} disabled={matchEnded} onAct={act} />
        ))}
      </div>
    </div>
  );
}

function Btn({ children, onClick, primary, danger }: { children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium ${
        danger ? 'bg-red-600 hover:bg-red-500 text-white'
        : primary ? 'bg-primary hover:bg-primary-dark text-dark font-semibold'
        : 'bg-dark border border-dark-lighter hover:border-gray-600'}`}>
      {children}
    </button>
  );
}

function TeamBox({ team, state, disabled, onAct }: {
  team: RosterTeam; state: BasketballState; disabled: boolean; onAct: (playerId: string, kind: BasketballActionKind) => void;
}) {
  const tone: Record<string, string> = {
    good: 'bg-primary/70 hover:bg-primary text-dark',
    bad: 'bg-red-900/50 hover:bg-red-800 text-red-100',
    neutral: 'bg-dark border border-dark-lighter hover:border-gray-600',
  };
  return (
    <div className="bg-dark-light rounded-xl border border-dark-lighter p-4 space-y-2">
      <h3 className="font-semibold">{team.name}</h3>
      <div className="space-y-1.5">
        {team.players.map((p) => {
          const st = state.players[p.userId] ?? emptyPlayer(team.teamId);
          return (
            <div key={p.userId} className="rounded-md px-2 py-1.5 bg-dark border border-dark-lighter">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm truncate font-medium">{p.name}</span>
                <span className="text-[10px] text-gray-custom font-mono">{st.pts}p {st.reb}r {st.ast}a</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {ACTIONS.map((a) => (
                  <button key={a.kind} disabled={disabled} onClick={() => onAct(p.userId, a.kind)}
                    className={`h-7 px-2 rounded text-[11px] font-medium disabled:opacity-40 ${tone[a.tone]}`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

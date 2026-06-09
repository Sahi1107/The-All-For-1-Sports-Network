import { useEffect, useMemo, useState } from 'react';
import type { useTrackerMatch } from '../useTrackerMatch';
import type {
  FootballState, FootballEventType, RosterTeam, RosterPlayer,
} from '../types';

type Ctrl = ReturnType<typeof useTrackerMatch>;

const ACTIONS: { key: FootballEventType; label: string; tone: string; title: string }[] = [
  { key: 'goal', label: 'G', tone: 'good', title: 'Goal' },
  { key: 'assist', label: 'A', tone: 'good', title: 'Assist' },
  { key: 'shot_on', label: 'ST', tone: 'good', title: 'Shot on target' },
  { key: 'shot_off', label: 'SF', tone: 'neutral', title: 'Shot off target' },
  { key: 'save', label: 'Sv', tone: 'good', title: 'Save' },
  { key: 'tackle', label: 'T', tone: 'good', title: 'Tackle' },
  { key: 'pass_complete', label: 'P✓', tone: 'good', title: 'Pass completed' },
  { key: 'pass_incomplete', label: 'P✗', tone: 'bad', title: 'Pass incomplete' },
  { key: 'yellow_card', label: 'YC', tone: 'yellow', title: 'Yellow card' },
  { key: 'red_card', label: 'RC', tone: 'red', title: 'Red card' },
];

function liveSeconds(s: FootballState): number {
  if (s.clockRunning && s.lastTickAt) return s.elapsedSeconds + (Date.now() - s.lastTickAt) / 1000;
  return s.elapsedSeconds;
}
const fmt = (sec: number) => {
  const t = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

function emptyState(halfLengthSeconds: number): FootballState {
  return {
    half: 1, halfLengthSeconds, elapsedSeconds: 0, clockRunning: false,
    homeLineup: [], awayLineup: [], startingHome: [], startingAway: [],
    events: [], substitutions: [],
  };
}

export default function FootballMatch({ ctrl }: { ctrl: Ctrl }) {
  const { match, session, updateState, setStatus } = ctrl;
  const [, force] = useState(0);

  const homeTeam = useMemo(
    () => (session?.roster ?? []).find((t) => t.teamId === match?.homeTeamId),
    [session, match?.homeTeamId],
  );
  const awayTeam = useMemo(
    () => (session?.roster ?? []).find((t) => t.teamId === match?.awayTeamId),
    [session, match?.awayTeamId],
  );

  const state = match?.state as FootballState | null;

  // live clock re-render
  useEffect(() => {
    if (!state?.clockRunning) return;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [state?.clockRunning]);

  // periodic commit of running clock so elapsedSeconds persists
  useEffect(() => {
    if (!state?.clockRunning) return;
    const id = setInterval(() => {
      updateState((s) => {
        const fs = s as FootballState;
        if (!fs.clockRunning || !fs.lastTickAt) return fs;
        const now = Date.now();
        return { ...fs, elapsedSeconds: fs.elapsedSeconds + (now - fs.lastTickAt) / 1000, lastTickAt: now };
      });
    }, 10000);
    return () => clearInterval(id);
  }, [state?.clockRunning, updateState]);

  if (!match || !session || !homeTeam || !awayTeam) {
    return <div className="bg-dark-light rounded-xl border border-dark-lighter p-6 text-sm text-gray-custom">Teams not assigned yet.</div>;
  }

  const halfLen = session.config?.halfLengthSeconds ?? 2700;

  // ── Lineup setup ──
  if (!state || state.startingHome.length === 0 || state.startingAway.length === 0) {
    return (
      <LineupSetup
        home={homeTeam} away={awayTeam}
        onConfirm={(homeIds, awayIds) => {
          const base = state ?? emptyState(halfLen);
          updateState(() => ({
            ...base, halfLengthSeconds: halfLen,
            startingHome: homeIds, startingAway: awayIds,
            homeLineup: homeIds, awayLineup: awayIds,
          }));
        }}
      />
    );
  }

  const sec = liveSeconds(state);
  const minute = Math.floor(sec / 60);
  const matchEnded = match.status === 'COMPLETED' || match.status === 'PUBLISHED';

  function commitClock(s: FootballState): FootballState {
    if (s.clockRunning && s.lastTickAt) {
      return { ...s, elapsedSeconds: s.elapsedSeconds + (Date.now() - s.lastTickAt) / 1000 };
    }
    return s;
  }

  function addEvent(type: FootballEventType, playerId: string, teamId: string, isPenalty?: boolean) {
    if (matchEnded) return;
    updateState((s) => {
      const fs = s as FootballState;
      const total = liveSeconds(fs);
      return {
        ...fs,
        events: [...fs.events, {
          id: uid(), type, playerId, teamId, half: fs.half,
          minute: Math.floor(total / 60), second: Math.floor(total % 60),
          isPenalty, createdAt: Date.now(),
        }],
      };
    });
  }

  function start() {
    updateState((s) => ({ ...(s as FootballState), clockRunning: true, startedAt: (s as FootballState).startedAt ?? Date.now(), lastTickAt: Date.now() }));
    void setStatus('IN_PROGRESS');
  }
  function pause() {
    updateState((s) => ({ ...commitClock(s as FootballState), clockRunning: false, lastTickAt: undefined }));
  }
  function resume() {
    updateState((s) => ({ ...(s as FootballState), clockRunning: true, lastTickAt: Date.now() }));
  }
  function secondHalf() {
    if (!confirm('Start second half?')) return;
    updateState((s) => ({ ...(s as FootballState), half: 2, elapsedSeconds: halfLen, clockRunning: true, lastTickAt: Date.now() }));
  }
  function end() {
    if (!confirm('End match? You can still publish and export afterward.')) return;
    updateState((s) => ({ ...commitClock(s as FootballState), clockRunning: false, lastTickAt: undefined }));
    void setStatus('COMPLETED');
  }

  return (
    <div className="space-y-4">
      {/* Score + clock */}
      <div className="bg-dark-light rounded-xl border border-dark-lighter p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="text-right truncate font-semibold">{homeTeam.name}</div>
          <div className="flex flex-col items-center">
            <div className="text-4xl font-mono font-bold tabular-nums">{match.homeScore}<span className="text-gray-custom mx-2">–</span>{match.awayScore}</div>
            <div className="text-sm font-mono text-primary-light mt-1">{fmt(sec)} <span className="text-gray-custom">({minute}′)</span></div>
            <div className="text-xs text-gray-custom">Half {state.half}</div>
          </div>
          <div className="text-left truncate font-semibold">{awayTeam.name}</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {!state.startedAt && <Btn primary onClick={start}>▶ Start match</Btn>}
          {state.startedAt && !matchEnded && (
            <>
              {state.clockRunning ? <Btn onClick={pause}>⏸ Pause</Btn> : <Btn primary onClick={resume}>▶ Resume</Btn>}
              {state.half === 1 && <Btn onClick={secondHalf}>Start 2nd half</Btn>}
              <Btn danger onClick={end}>End match</Btn>
            </>
          )}
          {matchEnded && <span className="text-xs px-3 py-1 rounded-full bg-primary/20 text-primary-light">Final</span>}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <TeamPanel team={homeTeam} side="home" state={state} disabled={matchEnded} onAction={addEvent}
          onSub={(o, i) => updateState((s) => applySub(s as FootballState, 'home', homeTeam.teamId, o, i))} />
        <TeamPanel team={awayTeam} side="away" state={state} disabled={matchEnded} onAction={addEvent}
          onSub={(o, i) => updateState((s) => applySub(s as FootballState, 'away', awayTeam.teamId, o, i))} />
      </div>

      <EventLog state={state} home={homeTeam} away={awayTeam} disabled={matchEnded}
        onRemove={(id) => updateState((s) => ({ ...(s as FootballState), events: (s as FootballState).events.filter((e) => e.id !== id) }))} />
    </div>
  );
}

function applySub(s: FootballState, side: 'home' | 'away', teamId: string, outId: string, inId: string): FootballState {
  const total = liveSeconds(s);
  const lineupKey = side === 'home' ? 'homeLineup' : 'awayLineup';
  const lineup = [...s[lineupKey]];
  const idx = lineup.indexOf(outId);
  if (idx !== -1) lineup[idx] = inId;
  return {
    ...s,
    [lineupKey]: lineup,
    substitutions: [...s.substitutions, { id: uid(), teamId, outPlayerId: outId, inPlayerId: inId, half: s.half, minute: Math.floor(total / 60) }],
  };
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

function LineupSetup({ home, away, onConfirm }: { home: RosterTeam; away: RosterTeam; onConfirm: (h: string[], a: string[]) => void }) {
  const [h, setH] = useState<string[]>([]);
  const [a, setA] = useState<string[]>([]);
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  return (
    <div className="space-y-4">
      <div className="bg-dark-light rounded-xl border border-dark-lighter p-4">
        <h2 className="font-semibold">Set starting lineups</h2>
        <p className="text-sm text-gray-custom">Tap players to add them to the starting XI. You can sub others in later.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {[[home, h, setH] as const, [away, a, setA] as const].map(([team, sel, set]) => (
          <div key={team.teamId} className="bg-dark-light rounded-xl border border-dark-lighter p-4">
            <h3 className="font-semibold mb-2">{team.name} <span className="text-xs text-gray-custom">({sel.length})</span></h3>
            {team.players.length === 0 ? <p className="text-sm text-gray-custom">No players registered.</p> : (
              <div className="grid grid-cols-2 gap-2">
                {team.players.map((p) => (
                  <button key={p.userId} onClick={() => toggle(sel, set, p.userId)}
                    className={`text-left text-sm px-3 py-2 rounded border ${sel.includes(p.userId) ? 'bg-primary/15 border-primary' : 'bg-dark border-dark-lighter'}`}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button disabled={h.length === 0 || a.length === 0} onClick={() => onConfirm(h, a)}
          className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg text-sm disabled:opacity-40">
          Confirm lineups
        </button>
      </div>
    </div>
  );
}

function TeamPanel({ team, side, state, disabled, onAction, onSub }: {
  team: RosterTeam; side: 'home' | 'away'; state: FootballState; disabled: boolean;
  onAction: (type: FootballEventType, playerId: string, teamId: string, isPenalty?: boolean) => void;
  onSub: (outId: string, inId: string) => void;
}) {
  const lineup = side === 'home' ? state.homeLineup : state.awayLineup;
  const onPitch = team.players.filter((p) => lineup.includes(p.userId));
  const bench = team.players.filter((p) => !lineup.includes(p.userId));
  const [subOut, setSubOut] = useState<string | null>(null);

  const tone: Record<string, string> = {
    good: 'bg-primary/70 hover:bg-primary text-dark',
    bad: 'bg-red-900/50 hover:bg-red-800 text-red-100',
    neutral: 'bg-dark border border-dark-lighter hover:border-gray-600',
    yellow: 'bg-yellow-500/80 hover:bg-yellow-400 text-dark',
    red: 'bg-red-600 hover:bg-red-500 text-white',
  };

  return (
    <div className="bg-dark-light rounded-xl border border-dark-lighter p-4 space-y-2">
      <h3 className="font-semibold">{team.name}</h3>
      <div className="space-y-1.5">
        {onPitch.map((p: RosterPlayer) => {
          const g = state.events.filter((e) => e.playerId === p.userId && e.type === 'goal').length;
          const as = state.events.filter((e) => e.playerId === p.userId && e.type === 'assist').length;
          return (
            <div key={p.userId} className="rounded-md px-2 py-1.5 bg-dark border border-dark-lighter">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm truncate font-medium">{p.name}</span>
                <span className="text-[10px] text-gray-custom font-mono">G{g} A{as}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {ACTIONS.map((act) => (
                  <button key={act.key} title={act.title} disabled={disabled}
                    onClick={() => {
                      if (act.key === 'goal') onAction('goal', p.userId, team.teamId, confirm('Was this a penalty? OK = penalty · Cancel = open play'));
                      else onAction(act.key, p.userId, team.teamId);
                    }}
                    className={`h-7 min-w-7 px-1.5 rounded text-[11px] font-medium disabled:opacity-40 ${tone[act.tone]}`}>
                    {act.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {bench.length > 0 && (
        <div>
          <div className="flex items-center justify-between mt-2 mb-1">
            <span className="text-[10px] uppercase tracking-wide text-gray-custom">Bench</span>
            {subOut && <span className="text-[10px] text-amber-300">Pick player coming on →</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {onPitch.map((p) => (
              <button key={'off' + p.userId} disabled={disabled} onClick={() => setSubOut(subOut === p.userId ? null : p.userId)}
                className={`text-[11px] px-2 py-1 rounded border ${subOut === p.userId ? 'border-red-500 bg-red-500/20' : 'border-dark-lighter bg-dark'}`}>
                ↓ {p.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {bench.map((p) => (
              <button key={'on' + p.userId} disabled={disabled || !subOut} onClick={() => { if (subOut) { onSub(subOut, p.userId); setSubOut(null); } }}
                className="text-[11px] px-2 py-1 rounded border border-dark-lighter bg-dark disabled:opacity-40">
                ↑ {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventLog({ state, home, away, disabled, onRemove }: {
  state: FootballState; home: RosterTeam; away: RosterTeam; disabled: boolean; onRemove: (id: string) => void;
}) {
  const name = new Map<string, string>();
  [...home.players, ...away.players].forEach((p) => name.set(p.userId, p.name));
  const teamName = (id: string) => (id === home.teamId ? home.name : away.name);
  const notable = state.events
    .filter((e) => e.type !== 'pass_complete' && e.type !== 'pass_incomplete')
    .slice().sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="bg-dark-light rounded-xl border border-dark-lighter p-4">
      <h3 className="font-semibold mb-2">Match log</h3>
      {notable.length === 0 ? <p className="text-sm text-gray-custom">Events appear here.</p> : (
        <ul className="divide-y divide-dark-lighter">
          {notable.map((e) => (
            <li key={e.id} className="flex items-center justify-between text-sm py-1.5">
              <span><span className="font-mono text-xs text-gray-custom w-10 inline-block">{e.minute}′</span>
                {labelFor(e.type)} — {name.get(e.playerId)} <span className="text-gray-custom">({teamName(e.teamId)})</span>{e.isPenalty ? ' (pen)' : ''}</span>
              <button disabled={disabled} onClick={() => onRemove(e.id)} className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40">Undo</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelFor(t: FootballEventType): string {
  const m: Record<FootballEventType, string> = {
    goal: '⚽ Goal', assist: '🅰 Assist', tackle: '🛡 Tackle', shot_on: '🎯 Shot on',
    shot_off: '↗ Shot off', save: '🧤 Save', pass_complete: 'Pass', pass_incomplete: 'Pass miss',
    yellow_card: '🟨 Yellow', red_card: '🟥 Red',
  };
  return m[t];
}

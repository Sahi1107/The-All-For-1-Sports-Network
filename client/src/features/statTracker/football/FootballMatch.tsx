import { useEffect, useMemo, useState } from 'react';
import './tracker.css';
import type { useTrackerMatch } from '../useTrackerMatch';
import type {
  FootballState, FootballEvent, FootballEventType, RosterTeam,
} from '../types';

// ── Local view-model types (mirror the standalone app's Player/Team/Match) ──
type EventType = FootballEventType;
interface Player { id: string; name: string; number?: number; position?: string }
interface Team { id: string; name: string; players: Player[] }
interface MatchView {
  id: string; stage: string;
  homeTeamId: string; awayTeamId: string;
  homeScore: number; awayScore: number;
  half: 1 | 2; halfLengthSeconds: number; elapsedSeconds: number;
  clockRunning: boolean; lastTickAt?: number; startedAt?: number;
  homeLineup: string[]; awayLineup: string[];
  events: FootballEvent[];
  ended: boolean;
}

type Ctrl = ReturnType<typeof useTrackerMatch>;
type ActionKey = EventType;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function pct(num: number, den: number, digits = 0): string {
  if (!den) return '—';
  return `${((num / den) * 100).toFixed(digits)}%`;
}
function currentSeconds(m: { clockRunning: boolean; lastTickAt?: number; elapsedSeconds: number }): number {
  if (m.clockRunning && m.lastTickAt) return m.elapsedSeconds + (Date.now() - m.lastTickAt) / 1000;
  return m.elapsedSeconds;
}
function emptyState(halfLengthSeconds: number): FootballState {
  return {
    half: 1, halfLengthSeconds, elapsedSeconds: 0, clockRunning: false,
    homeLineup: [], awayLineup: [], startingHome: [], startingAway: [],
    events: [], substitutions: [],
  };
}
function teamToView(t: RosterTeam): Team {
  return { id: t.teamId, name: t.name, players: t.players.map((p) => ({ id: p.userId, name: p.name, number: p.number ?? undefined, position: p.position ?? undefined })) };
}

export default function FootballMatch({ ctrl }: { ctrl: Ctrl }) {
  const { match, session, updateState, setStatus } = ctrl;
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [pendingGoal, setPendingGoal] = useState<{ player: Player; team: Team } | null>(null);
  const [subModalTeam, setSubModalTeam] = useState<Team | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const halfLen = session?.config?.halfLengthSeconds ?? 2700;
  const homeTeam = useMemo(() => {
    const t = (session?.roster ?? []).find((x) => x.teamId === match?.homeTeamId);
    return t ? teamToView(t) : undefined;
  }, [session, match?.homeTeamId]);
  const awayTeam = useMemo(() => {
    const t = (session?.roster ?? []).find((x) => x.teamId === match?.awayTeamId);
    return t ? teamToView(t) : undefined;
  }, [session, match?.awayTeamId]);

  const state = match?.state as FootballState | null;
  const matchEnded = match?.status === 'COMPLETED' || match?.status === 'PUBLISHED';

  // Adapter "match" object for the view components.
  const m: MatchView | null = match && state ? {
    id: match.id, stage: match.stage,
    homeTeamId: match.homeTeamId!, awayTeamId: match.awayTeamId!,
    homeScore: match.homeScore, awayScore: match.awayScore,
    half: state.half, halfLengthSeconds: state.halfLengthSeconds,
    elapsedSeconds: state.elapsedSeconds, clockRunning: state.clockRunning,
    lastTickAt: state.lastTickAt, startedAt: state.startedAt,
    homeLineup: state.homeLineup, awayLineup: state.awayLineup,
    events: state.events, ended: matchEnded,
  } : null;

  // Live clock ticker + periodic commit (mirrors the standalone tracker).
  useEffect(() => {
    if (!m) return;
    const id = window.setInterval(() => setDisplaySeconds(currentSeconds(m)), 250);
    const commit = window.setInterval(() => {
      if (m.clockRunning) tickClock();
    }, 5000);
    return () => { window.clearInterval(id); window.clearInterval(commit); };
  }, [m?.clockRunning, m?.lastTickAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts.
  useEffect(() => {
    if (!m || !homeTeam || !awayTeam || matchEnded) return;
    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (pendingGoal || subModalTeam) return;
      if (e.key === 'Escape') { setSelectedPlayerId(null); return; }
      if (!selectedPlayerId) return;
      const action = KEY_TO_ACTION[e.key.toLowerCase()];
      if (!action) return;
      const onPitch = new Set([...m!.homeLineup, ...m!.awayLineup]);
      if (!onPitch.has(selectedPlayerId)) return;
      const homePlayer = homeTeam!.players.find((p) => p.id === selectedPlayerId);
      const team = homePlayer ? homeTeam! : awayTeam!;
      const player = homePlayer ?? awayTeam!.players.find((p) => p.id === selectedPlayerId)!;
      if (!team || !player) return;
      e.preventDefault();
      if (action === 'goal') { setPendingGoal({ player, team }); return; }
      addEvent({ type: action, playerId: player.id, teamId: team.id });
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [m, homeTeam, awayTeam, selectedPlayerId, pendingGoal, subModalTeam, matchEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!match || !session || !homeTeam || !awayTeam) {
    return <div className="ftm-tracker"><div className="card">Both teams must be assigned before tracking this match.</div></div>;
  }

  // ── State mutators (wired to the synced store) ──
  function commit(s: FootballState): FootballState {
    if (s.clockRunning && s.lastTickAt) return { ...s, elapsedSeconds: s.elapsedSeconds + (Date.now() - s.lastTickAt) / 1000 };
    return s;
  }
  function setLineup(side: 'home' | 'away', ids: string[]) {
    updateState((s) => {
      const fs = (s as FootballState) ?? emptyState(halfLen);
      return side === 'home'
        ? { ...fs, halfLengthSeconds: halfLen, homeLineup: ids, startingHome: ids }
        : { ...fs, halfLengthSeconds: halfLen, awayLineup: ids, startingAway: ids };
    });
  }
  function startMatch() {
    updateState((s) => ({ ...(s as FootballState), clockRunning: true, startedAt: (s as FootballState).startedAt ?? Date.now(), lastTickAt: Date.now() }));
    void setStatus('IN_PROGRESS');
  }
  function pauseClock() { updateState((s) => { const fs = commit(s as FootballState); return { ...fs, clockRunning: false, lastTickAt: undefined }; }); }
  function resumeClock() { updateState((s) => ({ ...(s as FootballState), clockRunning: true, lastTickAt: Date.now() })); }
  function tickClock() {
    updateState((s) => {
      const fs = s as FootballState;
      if (!fs.clockRunning || !fs.lastTickAt) return fs;
      return { ...fs, elapsedSeconds: fs.elapsedSeconds + (Date.now() - fs.lastTickAt) / 1000, lastTickAt: Date.now() };
    });
  }
  function startSecondHalf() { updateState((s) => ({ ...(s as FootballState), half: 2, elapsedSeconds: halfLen, clockRunning: true, lastTickAt: Date.now() })); }
  function endMatch() { updateState((s) => { const fs = commit(s as FootballState); return { ...fs, clockRunning: false, lastTickAt: undefined }; }); void setStatus('COMPLETED'); }
  function addEvent(e: { type: EventType; playerId: string; teamId: string; isPenalty?: boolean }) {
    updateState((s) => {
      const fs = s as FootballState;
      const total = currentSeconds(fs);
      const evt: FootballEvent = {
        id: uid(), type: e.type, playerId: e.playerId, teamId: e.teamId, half: fs.half,
        minute: Math.floor(total / 60), second: Math.floor(total % 60), isPenalty: e.isPenalty, createdAt: Date.now(),
      };
      return { ...fs, events: [...fs.events, evt] };
    });
  }
  function removeEvent(eventId: string) {
    updateState((s) => { const fs = s as FootballState; return { ...fs, events: fs.events.filter((x) => x.id !== eventId) }; });
  }
  function addSubstitution(sb: { teamId: string; outPlayerId: string; inPlayerId: string }) {
    updateState((s) => {
      const fs = s as FootballState;
      const side = fs.homeLineup.includes(sb.outPlayerId) ? 'home' : 'away';
      const key = side === 'home' ? 'homeLineup' : 'awayLineup';
      const lineup = [...fs[key]];
      const idx = lineup.indexOf(sb.outPlayerId);
      if (idx !== -1) lineup[idx] = sb.inPlayerId;
      return { ...fs, [key]: lineup, substitutions: [...fs.substitutions, { id: uid(), ...sb, half: fs.half, minute: Math.floor(currentSeconds(fs) / 60) }] };
    });
  }

  // ── Lineup setup ──
  const needsLineup = !m || m.homeLineup.length === 0 || m.awayLineup.length === 0;
  if (needsLineup) {
    return (
      <div className="ftm-tracker">
        <LineupSetup
          homeTeam={homeTeam} awayTeam={awayTeam}
          initialHome={m?.homeLineup ?? []} initialAway={m?.awayLineup ?? []}
          onConfirm={(homeIds, awayIds) => { setLineup('home', homeIds); setLineup('away', awayIds); }}
        />
      </div>
    );
  }

  const halfNumber = m!.half;
  const halfLength = m!.halfLengthSeconds;
  const halfStartSec = m!.half === 1 ? 0 : halfLength;
  const halfElapsed = Math.max(0, displaySeconds - halfStartSec);
  const minuteDisplay = Math.floor(displaySeconds / 60);

  return (
    <div className="ftm-tracker">
      <div className="space-y-4">
        {/* Score / Clock header */}
        <div className="card">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-ink-400">Live match</div>
            <div className="text-xs text-ink-400">
              {m!.stage === 'group' ? 'Group stage' : m!.stage.toUpperCase()} · Half {halfNumber}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-ink-400">Home</div>
              <div className="text-xl font-semibold truncate">{homeTeam.name}</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-5xl font-mono font-bold tabular-nums">
                {m!.homeScore}<span className="text-ink-400 mx-2">–</span>{m!.awayScore}
              </div>
              <div className="mt-1 text-lg font-mono text-pitch-500">
                {formatClock(displaySeconds)}<span className="text-ink-400 text-sm ml-2">({minuteDisplay}′)</span>
              </div>
              <div className="text-xs text-ink-400">
                Half {halfNumber} · {formatClock(halfElapsed)} / {formatClock(halfLength)}
              </div>
            </div>
            <div className="text-left">
              <div className="text-sm text-ink-400">Away</div>
              <div className="text-xl font-semibold truncate">{awayTeam.name}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {!m!.startedAt && <button className="btn-primary" onClick={startMatch}>▶ Start match</button>}
            {m!.startedAt && !matchEnded && (
              <>
                {m!.clockRunning
                  ? <button className="btn-ghost" onClick={pauseClock}>⏸ Pause</button>
                  : <button className="btn-primary" onClick={resumeClock}>▶ Resume</button>}
                {halfNumber === 1 && <button className="btn-ghost" onClick={() => { if (confirm('Start second half?')) startSecondHalf(); }}>Start 2nd half</button>}
                <button className="btn-danger" onClick={() => { if (confirm('End match? Stats will be saved.')) endMatch(); }}>End match</button>
              </>
            )}
            {matchEnded && <span className="chip bg-pitch-700 text-white">Final</span>}
          </div>
        </div>

        {!matchEnded && <ShortcutsHint selectedPlayerId={selectedPlayerId} />}

        <div className="grid lg:grid-cols-2 gap-4">
          <TeamPanel team={homeTeam} lineupIds={m!.homeLineup} match={m!} selectedPlayerId={selectedPlayerId}
            onSelect={setSelectedPlayerId}
            onAction={(playerId, action) => {
              if (matchEnded) return;
              if (action === 'goal') { setPendingGoal({ player: homeTeam.players.find((p) => p.id === playerId)!, team: homeTeam }); return; }
              addEvent({ type: action, playerId, teamId: homeTeam.id });
            }}
            onSub={() => setSubModalTeam(homeTeam)} side="home" disabled={matchEnded} />
          <TeamPanel team={awayTeam} lineupIds={m!.awayLineup} match={m!} selectedPlayerId={selectedPlayerId}
            onSelect={setSelectedPlayerId}
            onAction={(playerId, action) => {
              if (matchEnded) return;
              if (action === 'goal') { setPendingGoal({ player: awayTeam.players.find((p) => p.id === playerId)!, team: awayTeam }); return; }
              addEvent({ type: action, playerId, teamId: awayTeam.id });
            }}
            onSub={() => setSubModalTeam(awayTeam)} side="away" disabled={matchEnded} />
        </div>

        <LiveStats match={m!} homeTeam={homeTeam} awayTeam={awayTeam} />

        <RecentEvents match={m!} homeTeam={homeTeam} awayTeam={awayTeam}
          onRemove={(eid) => removeEvent(eid)} disabled={matchEnded} />

        {pendingGoal && (
          <Modal onClose={() => setPendingGoal(null)} title="Goal">
            <div className="space-y-3">
              <div className="text-lg"><span className="font-semibold">{pendingGoal.player.name}</span> <span className="text-ink-400">({pendingGoal.team.name})</span></div>
              <div className="text-sm text-ink-400">Was this a penalty?</div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={() => { addEvent({ type: 'goal', playerId: pendingGoal.player.id, teamId: pendingGoal.team.id, isPenalty: false }); setPendingGoal(null); }}>Open play</button>
                <button className="btn-ghost flex-1" onClick={() => { addEvent({ type: 'goal', playerId: pendingGoal.player.id, teamId: pendingGoal.team.id, isPenalty: true }); setPendingGoal(null); }}>⚽ Penalty</button>
              </div>
            </div>
          </Modal>
        )}

        {subModalTeam && (
          <SubModal team={subModalTeam} match={m!} onClose={() => setSubModalTeam(null)}
            onConfirm={(outId, inId) => { addSubstitution({ teamId: subModalTeam.id, outPlayerId: outId, inPlayerId: inId }); setSubModalTeam(null); }} />
        )}
      </div>
    </div>
  );
}

// ── Lineup setup ──
function LineupSetup({ homeTeam, awayTeam, initialHome, initialAway, onConfirm }: {
  homeTeam: Team; awayTeam: Team; initialHome: string[]; initialAway: string[];
  onConfirm: (homeIds: string[], awayIds: string[]) => void;
}) {
  const [home, setHome] = useState<string[]>(initialHome);
  const [away, setAway] = useState<string[]>(initialAway);
  function toggle(side: 'home' | 'away', id: string) {
    if (side === 'home') setHome((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    else setAway((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }
  const ready = home.length > 0 && away.length > 0;
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-xs uppercase text-ink-400 tracking-wide">Set lineup</div>
        <h1 className="text-2xl font-semibold">{homeTeam.name} <span className="text-ink-400">vs</span> {awayTeam.name}</h1>
        <p className="text-sm text-ink-400 mt-1">Tap players to put them in the starting lineup. You can sub others in later.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <LineupPicker team={homeTeam} selected={home} onToggle={(id) => toggle('home', id)} />
        <LineupPicker team={awayTeam} selected={away} onToggle={(id) => toggle('away', id)} />
      </div>
      <div className="flex justify-end">
        <button className="btn-primary" disabled={!ready} onClick={() => onConfirm(home, away)}>Confirm lineups</button>
      </div>
    </div>
  );
}

function LineupPicker({ team, selected, onToggle }: { team: Team; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="card">
      <h2 className="font-semibold mb-2">{team.name} <span className="text-xs text-ink-400">({selected.length} selected)</span></h2>
      {team.players.length === 0 ? <div className="text-sm text-ink-400">No players.</div> : (
        <div className="grid grid-cols-2 gap-2">
          {team.players.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button key={p.id} onClick={() => onToggle(p.id)}
                className={`text-left px-3 py-2 rounded border ${on ? 'bg-pitch-700/40 border-pitch-500' : 'bg-ink-900/40 border-ink-700'}`}>
                <div className="text-sm">
                  {p.number !== undefined && <span className="font-mono text-ink-400 mr-1">#{p.number}</span>}{p.name}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Team panel + player action grid ──
function TeamPanel({ team, lineupIds, match, selectedPlayerId, onSelect, onAction, onSub, side, disabled }: {
  team: Team; lineupIds: string[]; match: MatchView; selectedPlayerId: string | null;
  onSelect: (id: string | null) => void; onAction: (playerId: string, action: ActionKey) => void;
  onSub: () => void; side: 'home' | 'away'; disabled: boolean;
}) {
  const onPitch = lineupIds.map((id) => team.players.find((p) => p.id === id)).filter(Boolean) as Player[];
  const bench = team.players.filter((p) => !lineupIds.includes(p.id));
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{team.name} <span className="text-xs text-ink-400 ml-1">({side === 'home' ? 'Home' : 'Away'})</span></h3>
        <button className="btn-ghost text-xs" disabled={disabled || bench.length === 0 || onPitch.length === 0} onClick={onSub}>Sub ↻</button>
      </div>
      <div className="space-y-1.5">
        <ActionHeader />
        {onPitch.map((p) => (
          <PlayerCard key={p.id} player={p} match={match} disabled={disabled}
            selected={selectedPlayerId === p.id}
            onSelect={() => onSelect(selectedPlayerId === p.id ? null : p.id)}
            onAction={(action) => onAction(p.id, action)} />
        ))}
      </div>
      {bench.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-400 mt-2 mb-1">Bench</div>
          <div className="flex flex-wrap gap-1">
            {bench.map((p) => (
              <span key={p.id} className="chip">{p.number !== undefined && `#${p.number} `}{p.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ACTION_COLUMNS: { key: ActionKey; label: string; icon: string; title: string; tone: 'good' | 'bad' | 'neutral' | 'yellow' | 'red'; hotkey: string }[] = [
  { key: 'goal', label: 'G', icon: '⚽', title: 'Goal', tone: 'good', hotkey: 'G' },
  { key: 'assist', label: 'A', icon: '🅰', title: 'Assist', tone: 'good', hotkey: 'A' },
  { key: 'shot_on', label: 'ST', icon: '🎯', title: 'Shot on target', tone: 'good', hotkey: 'S' },
  { key: 'shot_off', label: 'SF', icon: '↗', title: 'Shot off target', tone: 'neutral', hotkey: 'F' },
  { key: 'save', label: 'Sv', icon: '🧤', title: 'Save', tone: 'good', hotkey: 'V' },
  { key: 'tackle', label: 'T', icon: '🛡', title: 'Tackle', tone: 'good', hotkey: 'T' },
  { key: 'pass_complete', label: 'P✓', icon: '✓', title: 'Pass complete', tone: 'good', hotkey: 'C' },
  { key: 'pass_incomplete', label: 'P✗', icon: '✗', title: 'Pass incomplete', tone: 'bad', hotkey: 'X' },
  { key: 'yellow_card', label: 'YC', icon: '🟨', title: 'Yellow card', tone: 'yellow', hotkey: 'Y' },
  { key: 'red_card', label: 'RC', icon: '🟥', title: 'Red card', tone: 'red', hotkey: 'R' },
];
const KEY_TO_ACTION: Record<string, ActionKey> = ACTION_COLUMNS.reduce((acc, c) => ({ ...acc, [c.hotkey.toLowerCase()]: c.key }), {} as Record<string, ActionKey>);
const ROW_GRID = 'grid-cols-[minmax(0,1fr)_repeat(10,2rem)]';

function ShortcutsHint({ selectedPlayerId }: { selectedPlayerId: string | null }) {
  return (
    <div className="card text-xs text-ink-300 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="uppercase text-ink-400 tracking-wide">Shortcuts</span>
      <span className="text-ink-400">Click a player, then press:</span>
      {ACTION_COLUMNS.map((c) => (
        <span key={c.key} className="font-mono">
          <kbd className="px-1.5 py-0.5 rounded bg-ink-700 border border-ink-600 text-ink-100">{c.hotkey}</kbd> {c.title}
        </span>
      ))}
      <span className="font-mono"><kbd className="px-1.5 py-0.5 rounded bg-ink-700 border border-ink-600 text-ink-100">Esc</kbd> deselect</span>
      <span className="ml-auto text-ink-400">{selectedPlayerId ? '● Player selected' : '○ No player selected'}</span>
    </div>
  );
}

function ActionHeader() {
  return (
    <div className={`grid ${ROW_GRID} gap-1 items-center px-2 py-1 text-[10px] uppercase tracking-wide text-ink-400`}>
      <div>Player</div>
      {ACTION_COLUMNS.map((c) => <div key={c.key} className="text-center" title={c.title}>{c.label}</div>)}
    </div>
  );
}

function PlayerCard({ player, match, onAction, disabled, selected, onSelect }: {
  player: Player; match: MatchView; onAction: (a: ActionKey) => void; disabled: boolean; selected: boolean; onSelect: () => void;
}) {
  const stats = useMemo(() => {
    const evs = match.events.filter((e) => e.playerId === player.id);
    return {
      g: evs.filter((e) => e.type === 'goal').length,
      a: evs.filter((e) => e.type === 'assist').length,
      pc: evs.filter((e) => e.type === 'pass_complete').length,
      pi: evs.filter((e) => e.type === 'pass_incomplete').length,
    };
  }, [match.events, player.id]);
  const passes = stats.pc + stats.pi;
  const acc = pct(stats.pc, passes, 0);
  return (
    <div className={`grid ${ROW_GRID} gap-1 items-center rounded-md px-2 py-1.5 border ${selected ? 'bg-pitch-700/30 border-pitch-500 ring-1 ring-pitch-500' : 'bg-ink-900/60 border-ink-700'}`}>
      <button type="button" onClick={onSelect} disabled={disabled} className="min-w-0 text-left" title={selected ? 'Click to deselect' : 'Click to select for hotkeys'}>
        <div className="text-sm truncate">
          {player.number !== undefined && <span className="font-mono text-ink-400 mr-1">#{player.number}</span>}
          <span className="font-medium">{player.name}</span>
        </div>
        <div className="text-[10px] text-ink-400 font-mono">G {stats.g} · A {stats.a} · Pass {acc} <span className="text-ink-600">({passes})</span></div>
      </button>
      {ACTION_COLUMNS.map((c) => (
        <button key={c.key} title={c.title} disabled={disabled} onClick={() => onAction(c.key)}
          className={`h-8 w-8 rounded text-sm flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed ${
            c.tone === 'good' ? 'bg-pitch-700/60 hover:bg-pitch-600 text-white'
            : c.tone === 'bad' ? 'bg-red-900/50 hover:bg-red-800 text-red-100'
            : c.tone === 'yellow' ? 'bg-yellow-500/80 hover:bg-yellow-400 text-ink-900'
            : c.tone === 'red' ? 'bg-red-600 hover:bg-red-500 text-white'
            : 'bg-ink-700 hover:bg-ink-600 text-ink-200'}`}>
          {c.icon}
        </button>
      ))}
    </div>
  );
}

function LiveStats({ match, homeTeam, awayTeam }: { match: MatchView; homeTeam: Team; awayTeam: Team }) {
  const teamStats = (teamId: string) => {
    const evs = match.events.filter((e) => e.teamId === teamId);
    const goals = evs.filter((e) => e.type === 'goal').length;
    const shots = goals + evs.filter((e) => e.type === 'shot_on').length + evs.filter((e) => e.type === 'shot_off').length;
    const onTarget = goals + evs.filter((e) => e.type === 'shot_on').length;
    const pc = evs.filter((e) => e.type === 'pass_complete').length;
    const pi = evs.filter((e) => e.type === 'pass_incomplete').length;
    const tackles = evs.filter((e) => e.type === 'tackle').length;
    const saves = evs.filter((e) => e.type === 'save').length;
    return { shots, onTarget, goals, pc, pi, tackles, saves };
  };
  const h = teamStats(homeTeam.id);
  const a = teamStats(awayTeam.id);
  return (
    <div className="card">
      <h3 className="font-semibold mb-3">Live stats</h3>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 text-sm">
        <StatRow label="Shots" home={h.shots} away={a.shots} />
        <StatRow label="On target" home={h.onTarget} away={a.onTarget} />
        <StatRow label="Conversion" home={pct(h.goals, h.shots, 0)} away={pct(a.goals, a.shots, 0)} />
        <StatRow label="Pass accuracy" home={pct(h.pc, h.pc + h.pi, 0)} away={pct(a.pc, a.pc + a.pi, 0)} sub={`${h.pc}/${h.pc + h.pi}`} subAway={`${a.pc}/${a.pc + a.pi}`} />
        <StatRow label="Tackles" home={h.tackles} away={a.tackles} />
        <StatRow label="Saves" home={h.saves} away={a.saves} />
      </div>
    </div>
  );
}

function StatRow({ label, home, away, sub, subAway }: { label: string; home: number | string; away: number | string; sub?: string; subAway?: string }) {
  return (
    <>
      <div className="text-right font-mono">{home}{sub && <div className="text-xs text-ink-400">{sub}</div>}</div>
      <div className="text-center text-xs uppercase text-ink-400 self-center">{label}</div>
      <div className="text-left font-mono">{away}{subAway && <div className="text-xs text-ink-400">{subAway}</div>}</div>
    </>
  );
}

function RecentEvents({ match, homeTeam, awayTeam, onRemove, disabled }: {
  match: MatchView; homeTeam: Team; awayTeam: Team; onRemove: (id: string) => void; disabled: boolean;
}) {
  const playerById = new Map([...homeTeam.players, ...awayTeam.players].map((p) => [p.id, p]));
  const notable = match.events.filter((e) => e.type !== 'pass_complete' && e.type !== 'pass_incomplete').slice().sort((a, b) => b.createdAt - a.createdAt);
  if (notable.length === 0) {
    return <div className="card"><h3 className="font-semibold">Match log</h3><div className="text-sm text-ink-400 mt-2">Events will appear here. Passes are tracked but hidden from this log.</div></div>;
  }
  function describe(e: FootballEvent) {
    const p = playerById.get(e.playerId);
    const teamName = e.teamId === homeTeam.id ? homeTeam.name : awayTeam.name;
    switch (e.type) {
      case 'goal': return `⚽ Goal — ${p?.name} (${teamName})${e.isPenalty ? ' (pen.)' : ''}`;
      case 'assist': return `🅰 Assist — ${p?.name} (${teamName})`;
      case 'shot_on': return `🎯 Shot on target — ${p?.name} (${teamName})`;
      case 'shot_off': return `↗ Shot off target — ${p?.name} (${teamName})`;
      case 'save': return `🧤 Save — ${p?.name} (${teamName})`;
      case 'tackle': return `🛡 Tackle — ${p?.name} (${teamName})`;
      case 'yellow_card': return `🟨 Yellow card — ${p?.name} (${teamName})`;
      case 'red_card': return `🟥 Red card — ${p?.name} (${teamName})`;
      default: return `${e.type} — ${p?.name}`;
    }
  }
  return (
    <div className="card">
      <h3 className="font-semibold">Match log</h3>
      <ul className="divide-y divide-ink-700/60 mt-2">
        {notable.map((e) => (
          <li key={e.id} className="flex items-center justify-between text-sm py-1.5">
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-ink-400 w-10">{e.minute}′</span>
              <span>{describe(e)}</span>
            </span>
            <button className="text-xs text-red-400 hover:text-red-300" disabled={disabled} onClick={() => { if (confirm('Remove this event?')) onRemove(e.id); }}>Undo</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubModal({ team, match, onClose, onConfirm }: {
  team: Team; match: MatchView; onClose: () => void; onConfirm: (outId: string, inId: string) => void;
}) {
  const isHome = team.id === match.homeTeamId;
  const lineupIds = isHome ? match.homeLineup : match.awayLineup;
  const onPitch = team.players.filter((p) => lineupIds.includes(p.id));
  const bench = team.players.filter((p) => !lineupIds.includes(p.id));
  const [outId, setOutId] = useState<string | undefined>();
  const [inId, setInId] = useState<string | undefined>();
  return (
    <Modal onClose={onClose} title={`Substitute · ${team.name}`}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="label">Off</div>
          <div className="max-h-64 overflow-auto space-y-1">
            {onPitch.map((p) => (
              <button key={p.id} onClick={() => setOutId(p.id)} className={`block w-full text-left px-2 py-1.5 rounded text-sm ${outId === p.id ? 'bg-red-500/30 border border-red-500' : 'bg-ink-900/60 border border-ink-700'}`}>
                {p.number !== undefined && <span className="font-mono text-ink-400 mr-1">#{p.number}</span>}{p.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label">On</div>
          <div className="max-h-64 overflow-auto space-y-1">
            {bench.map((p) => (
              <button key={p.id} onClick={() => setInId(p.id)} className={`block w-full text-left px-2 py-1.5 rounded text-sm ${inId === p.id ? 'bg-pitch-700/40 border border-pitch-500' : 'bg-ink-900/60 border border-ink-700'}`}>
                {p.number !== undefined && <span className="font-mono text-ink-400 mr-1">#{p.number}</span>}{p.name}
              </button>
            ))}
            {bench.length === 0 && <div className="text-xs text-ink-400">No bench players</div>}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!outId || !inId} onClick={() => onConfirm(outId!, inId!)}>Confirm sub</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-ink-800 border border-ink-700 rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-200">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

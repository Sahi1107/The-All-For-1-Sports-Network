import { useState } from 'react';
import { type BoxScoreLine, type DerivedState, emptyLine, teamTotals } from '@af1/core';
import type { RosterTeam } from '../types';

// A live box score in the shape a basketball reader expects, in our theme and
// under our controls. Unlike the old entry table this is READ-ONLY: it exists to
// be checked against the scoreboard, not typed into, which is why it can afford
// the percentage columns the entry surface deliberately leaves out.

const pct = (made: number, att: number) => (att === 0 ? '–' : `${Math.round((made / att) * 100)}`);
const mins = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

const COLUMNS = [
  'MIN', 'PTS', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%',
  'OR', 'DR', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF',
] as const;

function LineCells({ line }: { line: BoxScoreLine }) {
  return (
    <>
      <td className="num">{mins(line.secondsPlayed)}</td>
      <td className="num strong">{line.pts}</td>
      <td className="num">{line.fg}/{line.fga}</td>
      <td className="num dim">{pct(line.fg, line.fga)}</td>
      <td className="num">{line.tp}/{line.tpa}</td>
      <td className="num dim">{pct(line.tp, line.tpa)}</td>
      <td className="num">{line.ft}/{line.fta}</td>
      <td className="num dim">{pct(line.ft, line.fta)}</td>
      <td className="num">{line.oreb}</td>
      <td className="num">{line.dreb}</td>
      <td className="num">{line.reb}</td>
      <td className="num">{line.ast}</td>
      <td className="num">{line.stl}</td>
      <td className="num">{line.blk}</td>
      <td className="num">{line.to}</td>
      <td className="num">{line.pf}</td>
    </>
  );
}

function TeamTable({ team, derived, onCourt, onPick, selectedId }: {
  team: RosterTeam;
  derived: DerivedState;
  onCourt: Set<string>;
  onPick: (playerId: string) => void;
  selectedId: string | null;
}) {
  const totals = teamTotals(derived.players, team.teamId);
  const rows = [...team.players].sort((a, b) => {
    // On-court players first — during a game that's who a reader is checking.
    const diff = Number(onCourt.has(b.userId)) - Number(onCourt.has(a.userId));
    if (diff !== 0) return diff;
    return (derived.players[b.userId]?.pts ?? 0) - (derived.players[a.userId]?.pts ?? 0);
  });

  return (
    <div className="bb-box-team">
      <div className="bb-box-team-head">
        <strong>{team.name}</strong>
        <span>{totals.pts} PTS</span>
      </div>
      <div className="bb-box-scroll">
        <table className="bb-box-table">
          <thead>
            <tr>
              <th scope="col" className="pl">Player</th>
              {COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const line = derived.players[p.userId] ?? emptyLine(team.teamId);
              return (
                <tr
                  key={p.userId}
                  className={p.userId === selectedId ? 'sel' : undefined}
                  onClick={() => onPick(p.userId)}
                >
                  <td className="pl">
                    <span className="bb-box-jersey">{p.number ?? '–'}</span>
                    <span className="bb-box-name">{p.name}</span>
                    {onCourt.has(p.userId) && <span className="bb-box-on">ON</span>}
                  </td>
                  <LineCells line={line} />
                </tr>
              );
            })}
            <tr className="tot">
              <td className="pl">Team</td>
              <LineCells line={totals} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The collapsible live box score. Collapsed by default: the court and the roster
 * rails are the entry surface, and a table that pushed them off-screen mid-game
 * would cost exactly the seconds this redesign is meant to save.
 */
export function BoxScorePanel({ homeTeam, awayTeam, derived, onPickPlayer, selectedId }: {
  homeTeam: RosterTeam;
  awayTeam: RosterTeam;
  derived: DerivedState;
  onPickPlayer: (playerId: string) => void;
  selectedId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const onCourt = new Set([...derived.onCourtHome, ...derived.onCourtAway]);

  return (
    <section className={`bb-box${open ? ' open' : ''}`}>
      <button
        type="button"
        className="bb-box-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="bb-box-toggle-label">Box score</span>
        <span className="bb-box-toggle-score">
          {teamTotals(derived.players, homeTeam.teamId).pts}
          <span className="dash">–</span>
          {teamTotals(derived.players, awayTeam.teamId).pts}
        </span>
        <span className="bb-box-chev" aria-hidden>{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="bb-box-body">
          <TeamTable team={homeTeam} derived={derived} onCourt={onCourt} onPick={onPickPlayer} selectedId={selectedId} />
          <TeamTable team={awayTeam} derived={derived} onCourt={onCourt} onPick={onPickPlayer} selectedId={selectedId} />
        </div>
      )}
    </section>
  );
}

/** One player's live line — what opens when their tab is clicked. */
export function PlayerStatLine({ name, jersey, line }: {
  name: string;
  jersey: number | null;
  line: BoxScoreLine;
}) {
  const stat = (label: string, value: string | number, tone?: 'key') => (
    <div className={`bb-stat${tone ? ' key' : ''}`} key={label}>
      <span className="bb-stat-v">{value}</span>
      <span className="bb-stat-l">{label}</span>
    </div>
  );
  return (
    <div className="bb-playerline">
      <div className="bb-playerline-head">
        <span className="bb-playerline-jersey">{jersey ?? '–'}</span>
        <span className="bb-playerline-name">{name}</span>
        <span className="bb-playerline-min">{mins(line.secondsPlayed)} min</span>
      </div>
      <div className="bb-statgrid">
        {stat('PTS', line.pts, 'key')}
        {stat('REB', line.reb, 'key')}
        {stat('AST', line.ast, 'key')}
        {stat('FG', `${line.fg}/${line.fga}`)}
        {stat('3PT', `${line.tp}/${line.tpa}`)}
        {stat('FT', `${line.ft}/${line.fta}`)}
        {stat('OR', line.oreb)}
        {stat('DR', line.dreb)}
        {stat('STL', line.stl)}
        {stat('BLK', line.blk)}
        {stat('TO', line.to)}
        {stat('PF', line.pf)}
      </div>
    </div>
  );
}

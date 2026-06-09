// Client-side aggregation for live display, the stats summary, and Excel export.
import type {
  TrackerSession,
  TrackerMatch,
  FootballState,
  BasketballState,
  RosterTeam,
} from './types';

export interface FootballPlayerRow {
  userId: string;
  name: string;
  teamName: string;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  saves: number;
  tackles: number;
  passC: number;
  passI: number;
  yellow: number;
  red: number;
  minutes: number;
}

export interface BasketballPlayerRow {
  userId: string;
  name: string;
  teamName: string;
  min: number;
  pts: number; ast: number; reb: number; stl: number; blk: number;
  fg: number; fga: number; tp: number; tpa: number; ft: number; fta: number; to: number;
}

function rosterMaps(roster: RosterTeam[] | null) {
  const playerName = new Map<string, string>();
  const playerTeam = new Map<string, string>();
  const teamName = new Map<string, string>();
  (roster ?? []).forEach((t) => {
    teamName.set(t.teamId, t.name);
    t.players.forEach((p) => {
      playerName.set(p.userId, p.name);
      playerTeam.set(p.userId, t.teamId);
    });
  });
  return { playerName, playerTeam, teamName };
}

export function footballPlayerRows(
  match: TrackerMatch,
  session: TrackerSession,
): FootballPlayerRow[] {
  const state = match.state as FootballState | null;
  const { playerName, playerTeam, teamName } = rosterMaps(session.roster);
  const rows = new Map<string, FootballPlayerRow>();
  const get = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = {
        userId: id, name: playerName.get(id) ?? id,
        teamName: teamName.get(playerTeam.get(id) ?? '') ?? '',
        goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, saves: 0,
        tackles: 0, passC: 0, passI: 0, yellow: 0, red: 0, minutes: 0,
      };
      rows.set(id, r);
    }
    return r;
  };
  if (!state) return [];
  for (const e of state.events) {
    const r = get(e.playerId);
    switch (e.type) {
      case 'goal': r.goals++; r.shots++; r.shotsOnTarget++; break;
      case 'assist': r.assists++; break;
      case 'shot_on': r.shots++; r.shotsOnTarget++; break;
      case 'shot_off': r.shots++; break;
      case 'save': r.saves++; break;
      case 'tackle': r.tackles++; break;
      case 'pass_complete': r.passC++; break;
      case 'pass_incomplete': r.passI++; break;
      case 'yellow_card': r.yellow++; break;
      case 'red_card': r.red++; break;
    }
  }
  // Minutes
  const matchMin = Math.round((state.elapsedSeconds || state.halfLengthSeconds * 2) / 60);
  const offAt = new Map<string, number>();
  const onAt = new Map<string, number>();
  state.substitutions.forEach((s) => {
    offAt.set(s.outPlayerId, s.minute);
    onAt.set(s.inPlayerId, s.minute);
  });
  [...state.startingHome, ...state.startingAway].forEach((id) => {
    get(id).minutes = offAt.has(id) ? offAt.get(id)! : matchMin;
  });
  onAt.forEach((min, id) => { get(id).minutes = Math.max(0, matchMin - min); });
  return [...rows.values()].sort((a, b) => b.goals - a.goals || b.assists - a.assists);
}

export function basketballPlayerRows(
  match: TrackerMatch,
  session: TrackerSession,
): BasketballPlayerRow[] {
  const state = match.state as BasketballState | null;
  const { playerName, teamName } = rosterMaps(session.roster);
  if (!state) return [];
  return Object.entries(state.players).map(([userId, p]) => ({
    userId,
    name: playerName.get(userId) ?? userId,
    teamName: teamName.get(p.teamId) ?? '',
    min: Math.round((p.secondsPlayed / 60) * 10) / 10,
    pts: p.pts, ast: p.ast, reb: p.reb, stl: p.stl, blk: p.blk,
    fg: p.fg, fga: p.fga, tp: p.tp, tpa: p.tpa, ft: p.ft, fta: p.fta, to: p.to,
  })).sort((a, b) => b.pts - a.pts);
}

// ─── Standings (league / per group) ──────────────────────────
export interface StandingRow {
  teamId: string;
  teamName: string;
  played: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
}

export function standingsFor(
  session: TrackerSession,
  teamIds: string[],
): StandingRow[] {
  const { teamName } = rosterMaps(session.roster);
  const table = new Map<string, StandingRow>();
  teamIds.forEach((id) =>
    table.set(id, {
      teamId: id, teamName: teamName.get(id) ?? id,
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    }),
  );
  session.matches.forEach((m) => {
    if (m.status !== 'COMPLETED' && m.status !== 'PUBLISHED') return;
    if (!m.homeTeamId || !m.awayTeamId) return;
    const h = table.get(m.homeTeamId), a = table.get(m.awayTeamId);
    if (!h || !a) return;
    h.played++; a.played++;
    h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore;
    a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) { h.wins++; a.losses++; h.points += 3; }
    else if (m.homeScore < m.awayScore) { a.wins++; h.losses++; a.points += 3; }
    else { h.draws++; a.draws++; h.points++; a.points++; }
  });
  table.forEach((s) => { s.goalDifference = s.goalsFor - s.goalsAgainst; });
  return [...table.values()].sort(
    (x, y) => y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor,
  );
}

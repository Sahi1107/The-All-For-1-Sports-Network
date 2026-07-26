import type {
  TrackerSession, TrackerMatch, TrackerSport, RosterTeam,
  FootballState, FootballEvent, BasketballState, BasketballPlayer,
} from '../types';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const FOOTBALL_NAMES = [
  ['A. Rivera', 'GK'], ['M. Okafor', 'DF'], ['L. Hassan', 'DF'], ['J. Mbappe', 'FW'],
  ['T. Silva', 'MF'], ['R. Kane', 'FW'], ['D. Costa', 'MF'], ['S. Park', 'DF'],
  ['N. Ozil', 'MF'], ['F. Torres', 'FW'], ['K. Walker', 'DF'], ['B. Saka', 'FW'],
];
const BASKETBALL_NAMES = [
  ['C. Johnson', 'PG'], ['D. Williams', 'SG'], ['M. Brown', 'SF'], ['A. Davis', 'PF'],
  ['T. Jackson', 'C'], ['R. Green', 'SG'], ['J. Smith', 'PF'], ['K. Lee', 'PG'],
];

const TEAM_NAMES = [
  'Hawks', 'Falcons', 'Titans', 'Vipers', 'Cobras', 'Rovers', 'Wolves', 'Comets',
];

function makeTeam(teamId: string, name: string, names: string[][]): RosterTeam {
  return {
    teamId,
    name,
    players: names.map(([pName, pos], i) => ({
      userId: `${teamId}-p${i}`,
      name: pName,
      position: pos,
      number: i + 1,
    })),
  };
}

/** Eight demo teams with full rosters for the given sport. */
export function buildDemoTeams(sport: TrackerSport): RosterTeam[] {
  const names = sport === 'FOOTBALL' ? FOOTBALL_NAMES : BASKETBALL_NAMES;
  return TEAM_NAMES.map((n, i) => makeTeam(`demo-t${i}`, `Demo ${n}`, names));
}

// ─── Result simulation (for the demo's "quick sim") ──────────
function rand(max: number) { return Math.floor(Math.random() * (max + 1)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function footballState(
  session: TrackerSession,
  home: RosterTeam,
  away: RosterTeam,
  homeGoals: number,
  awayGoals: number,
): FootballState {
  const halfLen = session.config?.halfLengthSeconds ?? 2700;
  const startingHome = home.players.slice(0, Math.min(7, home.players.length)).map((p) => p.userId);
  const startingAway = away.players.slice(0, Math.min(7, away.players.length)).map((p) => p.userId);
  const events: FootballEvent[] = [];

  const addGoals = (team: RosterTeam, lineup: string[], count: number) => {
    const scorers = lineup.length ? lineup : team.players.map((p) => p.userId);
    for (let i = 0; i < count; i++) {
      const scorer = pick(scorers);
      events.push({
        id: uid(), type: 'goal', playerId: scorer, teamId: team.teamId,
        half: rand(1) === 0 ? 1 : 2, minute: 1 + rand(halfLen / 60 * 2 - 1), second: rand(59),
        createdAt: Date.now() + i,
      });
      // occasional assist from a team-mate
      if (Math.random() < 0.6) {
        const assister = pick(scorers.filter((id) => id !== scorer).length ? scorers.filter((id) => id !== scorer) : scorers);
        events.push({ id: uid(), type: 'assist', playerId: assister, teamId: team.teamId, half: 1, minute: 0, second: 0, createdAt: Date.now() + i });
      }
    }
  };
  addGoals(home, startingHome, homeGoals);
  addGoals(away, startingAway, awayGoals);
  // a few saves for goalkeepers
  events.push({ id: uid(), type: 'save', playerId: startingHome[0], teamId: home.teamId, half: 1, minute: 0, second: 0, createdAt: Date.now() });
  events.push({ id: uid(), type: 'save', playerId: startingAway[0], teamId: away.teamId, half: 1, minute: 0, second: 0, createdAt: Date.now() });

  return {
    half: 2, halfLengthSeconds: halfLen, elapsedSeconds: halfLen * 2, clockRunning: false,
    homeLineup: startingHome, awayLineup: startingAway,
    startingHome, startingAway, events, substitutions: [],
  };
}

function basketballState(
  session: TrackerSession,
  home: RosterTeam,
  away: RosterTeam,
  homePts: number,
  awayPts: number,
): BasketballState {
  const quarterSeconds = session.config?.quarterSeconds ?? 720;
  const players: Record<string, BasketballPlayer> = {};

  const fill = (team: RosterTeam, target: number): string[] => {
    const onCourt = team.players.slice(0, Math.min(5, team.players.length)).map((p) => p.userId);
    team.players.forEach((p) => {
      players[p.userId] = { teamId: team.teamId, secondsPlayed: 0, pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, to: 0 };
    });
    // distribute points across on-court players in 2/3-point chunks
    let remaining = target;
    let guard = 0;
    while (remaining > 0 && guard++ < 400) {
      const id = pick(onCourt);
      const three = remaining >= 3 && Math.random() < 0.3;
      const val = three ? 3 : 2;
      if (val > remaining) continue;
      const p = players[id];
      p.pts += val;
      if (three) { p.tp += 1; p.tpa += 1; p.fg += 1; p.fga += 1; } else { p.fg += 1; p.fga += 1; }
      remaining -= val;
    }
    onCourt.forEach((id) => {
      const p = players[id];
      p.secondsPlayed = quarterSeconds * 4;
      p.reb += rand(8); p.ast += rand(6); p.stl += rand(3); p.blk += rand(2);
      p.fga += rand(4); // some misses
    });
    return onCourt;
  };

  const onCourtHome = fill(home, homePts);
  const onCourtAway = fill(away, awayPts);

  return {
    quarter: 4, quarterSeconds, clockSeconds: quarterSeconds, clockRunning: false,
    onCourtHome, onCourtAway, players, log: [],
  };
}

/** A plausible completed-match result (scoreline + light box score) for a demo
 *  fixture. Knockout ties are broken so the bracket can always advance. */
export function simulatedResult(
  session: TrackerSession,
  match: TrackerMatch,
): { homeScore: number; awayScore: number; state: TrackerMatch['state'] } {
  const home = (session.roster ?? []).find((t) => t.teamId === match.homeTeamId);
  const away = (session.roster ?? []).find((t) => t.teamId === match.awayTeamId);
  if (!home || !away) return { homeScore: 0, awayScore: 0, state: null };

  const knockout = !!match.bracketSlot;

  if (session.sport === 'FOOTBALL') {
    let h = rand(4), a = rand(4);
    if (knockout && h === a) { if (Math.random() < 0.5) h += 1; else a += 1; }
    return { homeScore: h, awayScore: a, state: footballState(session, home, away, h, a) };
  }

  let h = 55 + rand(45), a = 55 + rand(45);
  if (h === a) { if (Math.random() < 0.5) h += 1; else a += 1; }
  return { homeScore: h, awayScore: a, state: basketballState(session, home, away, h, a) };
}

import type { TrackerSession, TrackerMatch, TrackerSport, RosterTeam } from '../types';

const FOOTBALL_NAMES = [
  ['A. Rivera', 'GK'], ['M. Okafor', 'DF'], ['L. Ha9an', 'DF'], ['J. Mbappe', 'FW'],
  ['T. Silva', 'MF'], ['R. Kane', 'FW'], ['D. Costa', 'MF'], ['S. Park', 'DF'],
  ['N. Ozil', 'MF'], ['F. Torres', 'FW'], ['K. Walker', 'DF'], ['B. Saka', 'FW'],
];
const BASKETBALL_NAMES = [
  ['C. Johnson', 'PG'], ['D. Williams', 'SG'], ['M. Brown', 'SF'], ['A. Davis', 'PF'],
  ['T. Jackson', 'C'], ['R. Green', 'SG'], ['J. Smith', 'PF'], ['K. Lee', 'PG'],
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

/** Build a self-contained demo session + one fixture for the given sport.
 *  All ids are fake; nothing here references the platform DB. */
export function buildDemoSession(sport: TrackerSport): { session: TrackerSession; match: TrackerMatch } {
  const names = sport === 'FOOTBALL' ? FOOTBALL_NAMES : BASKETBALL_NAMES;
  const home = makeTeam('demo-home', 'Demo Hawks', names);
  const away = makeTeam('demo-away', 'Demo Falcons', names);

  const match: TrackerMatch = {
    id: 'demo-match',
    sessionId: 'demo-session',
    stage: 'league',
    round: 'Demo match',
    groupId: null,
    bracketSlot: null,
    feedsInto: null,
    orderIndex: 0,
    homeTeamId: home.teamId,
    awayTeamId: away.teamId,
    homeScore: 0,
    awayScore: 0,
    status: 'SCHEDULED',
    state: null,
    publishedMatchId: null,
  };

  const session: TrackerSession = {
    id: 'demo-session',
    tournamentId: 'demo',
    sport,
    format: 'LEAGUE',
    groups: null,
    bracket: null,
    // Short periods so the clock / halves / quarters are quick to exercise.
    config: sport === 'FOOTBALL' ? { halfLengthSeconds: 300 } : { quarterSeconds: 300 },
    roster: [home, away],
    matches: [match],
  };

  return { session, match };
}

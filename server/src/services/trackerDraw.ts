// Sport-agnostic fixture generation for the stat tracker.
// Ported & generalised from stat_tracker/Football/src/utils/draw.ts.
// Produces plain fixture descriptors that tracker.routes inserts as TrackerMatch rows,
// plus the session-level `groups` and `bracket` JSON structures.

import { randomUUID } from 'crypto';

export type Stage =
  | 'group'
  | 'league'
  | 'r32'
  | 'r16'
  | 'qf'
  | 'sf'
  | 'final'
  | 'third_place';

export interface FixtureDescriptor {
  stage: Stage;
  round?: string;
  groupId?: string;
  bracketSlot?: string;
  feedsInto?: string;
  orderIndex: number;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

export interface GroupDef {
  id: string;
  name: string;
  teamIds: string[];
}

export interface BracketSlotDef {
  id: string; // e.g. "qf-1"
  stage: Stage;
  feedFrom?: [string?, string?];
}

export interface BracketDef {
  stages: Stage[];
  slots: BracketSlotDef[];
  includesThirdPlace: boolean;
}

export interface DrawResult {
  groups: GroupDef[];
  bracket: BracketDef | null;
  fixtures: FixtureDescriptor[];
}

const STAGE_LABEL: Record<Stage, string> = {
  group: 'Group Stage',
  league: 'League',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  final: 'Final',
  third_place: 'Third place',
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Groups ──────────────────────────────────────────────────
export function buildGroups(teamIds: string[], groupCount: number): GroupDef[] {
  const shuffled = shuffle(teamIds);
  const groups: GroupDef[] = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push({ id: randomUUID(), name: `Group ${String.fromCharCode(65 + i)}`, teamIds: [] });
  }
  shuffled.forEach((id, idx) => groups[idx % groupCount].teamIds.push(id));
  return groups;
}

function groupFixtures(groups: GroupDef[], startOrder: number): FixtureDescriptor[] {
  const fixtures: FixtureDescriptor[] = [];
  let order = startOrder;
  groups.forEach((g) => {
    for (let i = 0; i < g.teamIds.length; i++) {
      for (let j = i + 1; j < g.teamIds.length; j++) {
        fixtures.push({
          stage: 'group',
          round: g.name,
          groupId: g.id,
          homeTeamId: g.teamIds[i],
          awayTeamId: g.teamIds[j],
          orderIndex: order++,
        });
      }
    }
  });
  return fixtures;
}

// ─── Round-robin league ──────────────────────────────────────
function leagueFixtures(teamIds: string[]): FixtureDescriptor[] {
  const fixtures: FixtureDescriptor[] = [];
  let order = 0;
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      fixtures.push({
        stage: 'league',
        round: STAGE_LABEL.league,
        homeTeamId: teamIds[i],
        awayTeamId: teamIds[j],
        orderIndex: order++,
      });
    }
  }
  return fixtures;
}

// ─── Knockout bracket ────────────────────────────────────────
function stagesForTeamCount(n: number): Stage[] {
  if (n <= 2) return ['final'];
  if (n <= 4) return ['sf', 'final'];
  if (n <= 8) return ['qf', 'sf', 'final'];
  if (n <= 16) return ['r16', 'qf', 'sf', 'final'];
  return ['r32', 'r16', 'qf', 'sf', 'final'];
}

const STAGE_SLOT_COUNT: Record<string, number> = {
  r32: 16, r16: 8, qf: 4, sf: 2, final: 1, third_place: 1, group: 0, league: 0,
};

export function buildBracket(participantCount: number, includesThirdPlace: boolean): BracketDef {
  const stages = stagesForTeamCount(participantCount);
  const slots: BracketSlotDef[] = [];
  const slotsByStage: Record<string, BracketSlotDef[]> = {};

  stages.forEach((st) => {
    const list: BracketSlotDef[] = [];
    for (let i = 0; i < STAGE_SLOT_COUNT[st]; i++) {
      const slot: BracketSlotDef = { id: `${st}-${i + 1}`, stage: st };
      list.push(slot);
      slots.push(slot);
    }
    slotsByStage[st] = list;
  });

  // Each slot in stage k is fed by slots 2i and 2i+1 of stage k-1
  for (let s = 1; s < stages.length; s++) {
    const prev = slotsByStage[stages[s - 1]];
    const cur = slotsByStage[stages[s]];
    cur.forEach((slot, i) => {
      slot.feedFrom = [prev[i * 2]?.id, prev[i * 2 + 1]?.id];
    });
  }

  if (includesThirdPlace && stages.includes('sf')) {
    const sfs = slotsByStage['sf'];
    slots.push({ id: 'third_place-1', stage: 'third_place', feedFrom: [sfs[0]?.id, sfs[1]?.id] });
  }

  return {
    stages: includesThirdPlace ? [...stages, 'third_place'] : stages,
    slots,
    includesThirdPlace,
  };
}

// Build one fixture per bracket slot, seeding the first round from `seedOrder`.
function bracketFixtures(
  bracket: BracketDef,
  seedOrder: string[] | null,
  startOrder: number,
): FixtureDescriptor[] {
  // feedsInto: invert feedFrom — each feeder slot points at the slot it feeds.
  const feedsInto = new Map<string, string>();
  bracket.slots.forEach((slot) => {
    (slot.feedFrom ?? []).forEach((fromId) => {
      if (fromId) feedsInto.set(fromId, slot.id);
    });
  });

  const firstStage = bracket.stages[0];
  const firstSlots = bracket.slots.filter((s) => s.stage === firstStage);
  const seedFor = new Map<string, { home?: string; away?: string }>();
  if (seedOrder) {
    firstSlots.forEach((slot, idx) => {
      seedFor.set(slot.id, { home: seedOrder[idx * 2], away: seedOrder[idx * 2 + 1] });
    });
  }

  let order = startOrder;
  return bracket.slots.map((slot) => {
    const seed = seedFor.get(slot.id);
    return {
      stage: slot.stage,
      round: STAGE_LABEL[slot.stage],
      bracketSlot: slot.id,
      feedsInto: feedsInto.get(slot.id),
      homeTeamId: seed?.home ?? null,
      awayTeamId: seed?.away ?? null,
      orderIndex: order++,
    };
  });
}

// ─── Public entry point ──────────────────────────────────────
export function generateDraw(
  format: 'LEAGUE' | 'KNOCKOUT' | 'MIXED',
  teamIds: string[],
  opts: { groupsCount?: number; advancePerGroup?: number; thirdPlace?: boolean } = {},
): DrawResult {
  if (format === 'LEAGUE') {
    return { groups: [], bracket: null, fixtures: leagueFixtures(teamIds) };
  }

  if (format === 'KNOCKOUT') {
    const bracket = buildBracket(teamIds.length, !!opts.thirdPlace);
    const fixtures = bracketFixtures(bracket, shuffle(teamIds), 0);
    return { groups: [], bracket, fixtures };
  }

  // MIXED: group stage + knockout (KO seeded later from standings)
  const groupsCount = Math.max(1, opts.groupsCount ?? 2);
  const advancePerGroup = Math.max(1, opts.advancePerGroup ?? 2);
  const groups = buildGroups(teamIds, groupsCount);
  const groupFx = groupFixtures(groups, 0);
  const advancing = groupsCount * advancePerGroup;
  const bracket = buildBracket(advancing, !!opts.thirdPlace);
  const koFx = bracketFixtures(bracket, null, groupFx.length);
  return { groups, bracket, fixtures: [...groupFx, ...koFx] };
}

// ─── Standings (for MIXED knockout seeding & dashboard display) ──
export interface Standing {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export function computeStandings(
  teamIds: string[],
  matches: { homeTeamId?: string | null; awayTeamId?: string | null; homeScore: number; awayScore: number; status: string }[],
): Standing[] {
  const table = new Map<string, Standing>();
  teamIds.forEach((id) =>
    table.set(id, {
      teamId: id, played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    }),
  );
  matches.forEach((m) => {
    if (m.status !== 'COMPLETED' && m.status !== 'PUBLISHED') return;
    if (!m.homeTeamId || !m.awayTeamId) return;
    const h = table.get(m.homeTeamId);
    const a = table.get(m.awayTeamId);
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

// Seed knockout first-round order from group standings (top N per group, snake-paired).
export function seedOrderFromGroups(
  groups: GroupDef[],
  standings: Standing[],
  advancePerGroup: number,
): string[] {
  const rankIn = (teamIds: string[]) =>
    standings.filter((s) => teamIds.includes(s.teamId)).map((s) => s.teamId);
  const advancing: string[] = [];
  groups.forEach((g) => {
    rankIn(g.teamIds).slice(0, advancePerGroup).forEach((id) => advancing.push(id));
  });
  // snake pairing: 1 vs last, 2 vs 2nd-last, …
  const half = Math.floor(advancing.length / 2);
  const order: string[] = [];
  for (let i = 0; i < half; i++) {
    order.push(advancing[i]);
    order.push(advancing[advancing.length - 1 - i]);
  }
  if (advancing.length % 2 === 1) order.push(advancing[half]);
  return order;
}

// Given a completed bracket match, return [winnerTeamId, feedsIntoSlotId] to propagate.
export function bracketWinner(m: {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore: number;
  awayScore: number;
}): string | null {
  if (!m.homeTeamId || !m.awayTeamId) return null;
  if (m.homeScore === m.awayScore) return null;
  return m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
}

export function bracketLoser(m: {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore: number;
  awayScore: number;
}): string | null {
  if (!m.homeTeamId || !m.awayTeamId) return null;
  if (m.homeScore === m.awayScore) return null;
  return m.homeScore > m.awayScore ? m.awayTeamId : m.homeTeamId;
}

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
  // 'COMPLETED' marks an auto-resolved bye (one team, no opponent); default SCHEDULED.
  status?: 'SCHEDULED' | 'COMPLETED';
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

export interface FirstRoundSeed {
  slotId: string;
  home: string | null;
  away: string | null;
  bye: boolean;
}
export interface ByeAdvance {
  slotId: string;            // parent slot the bye team advances into
  side: 'home' | 'away';     // side dictated by the parent's feedFrom order
  teamId: string;
}

/**
 * Seed a knockout's first round from an ordered team list, handling byes for any
 * non-power-of-2 count. Teams are spread round-robin across the first-round slots
 * so byes are distributed (never an empty slot, so byes never cascade). A slot
 * with a single team is a bye: that team auto-advances into its parent slot, on
 * the side that matches the parent's `feedFrom` order (so it agrees with
 * bracketAdvancements when the sibling match later resolves).
 */
export function seedFirstRound(
  bracket: BracketDef,
  teamOrder: string[],
): { seeds: FirstRoundSeed[]; byeAdvances: ByeAdvance[] } {
  const firstStage = bracket.stages[0];
  const firstSlots = bracket.slots.filter((s) => s.stage === firstStage);
  const teams = teamOrder.filter(Boolean);
  const S = firstSlots.length || 1;
  const buckets: string[][] = firstSlots.map(() => []);
  teams.forEach((t, i) => buckets[i % S].push(t));

  const seeds: FirstRoundSeed[] = [];
  const byeAdvances: ByeAdvance[] = [];
  firstSlots.forEach((slot, i) => {
    const home = buckets[i][0] ?? null;
    const away = buckets[i][1] ?? null;
    const bye = !!home && !away;
    seeds.push({ slotId: slot.id, home, away, bye });
    if (bye && home) {
      const parent = bracket.slots.find((s) => (s.feedFrom ?? []).includes(slot.id));
      if (parent) {
        const side: 'home' | 'away' = parent.feedFrom?.[0] === slot.id ? 'home' : 'away';
        byeAdvances.push({ slotId: parent.id, side, teamId: home });
      }
    }
  });
  return { seeds, byeAdvances };
}

// Build one fixture per bracket slot, seeding the first round from `seedOrder`
// (byes auto-advanced). When `seedOrder` is null the whole bracket is left empty
// (MIXED seeds it later from group standings via maybeSeedKnockout).
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

  const seedBySlot = new Map<string, FirstRoundSeed>();
  const byeBySlot = new Map<string, { home?: string; away?: string }>();
  if (seedOrder) {
    const { seeds, byeAdvances } = seedFirstRound(bracket, seedOrder);
    seeds.forEach((s) => seedBySlot.set(s.slotId, s));
    byeAdvances.forEach((a) => {
      const cur = byeBySlot.get(a.slotId) ?? {};
      if (a.side === 'home') cur.home = a.teamId; else cur.away = a.teamId;
      byeBySlot.set(a.slotId, cur);
    });
  }

  let order = startOrder;
  return bracket.slots.map((slot) => {
    const seed = seedBySlot.get(slot.id);
    const pre = byeBySlot.get(slot.id);
    return {
      stage: slot.stage,
      round: STAGE_LABEL[slot.stage],
      bracketSlot: slot.id,
      feedsInto: feedsInto.get(slot.id),
      homeTeamId: seed ? seed.home : pre?.home ?? null,
      awayTeamId: seed ? seed.away : pre?.away ?? null,
      status: seed?.bye ? 'COMPLETED' : undefined,
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

export interface BracketAdvancement {
  slotId: string;
  side: 'home' | 'away';
  teamId: string;
}

/** Every advancement a completed knockout match triggers: for each slot that
 *  the completed slot feeds, which side receives which team. A semifinal feeds
 *  two slots — the final (winner) and, when enabled, the third-place playoff
 *  (loser) — so targets are resolved from each slot's `feedFrom`, not from a
 *  single per-match pointer (which cannot represent feeding two slots). */
export function bracketAdvancements(
  bracket: BracketDef,
  completed: {
    bracketSlot?: string | null;
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    homeScore: number;
    awayScore: number;
  },
): BracketAdvancement[] {
  if (!completed.bracketSlot) return [];
  const out: BracketAdvancement[] = [];
  for (const slot of bracket.slots) {
    if (!(slot.feedFrom ?? []).some((from) => from === completed.bracketSlot)) continue;
    const teamId = slot.stage === 'third_place' ? bracketLoser(completed) : bracketWinner(completed);
    if (!teamId) continue;
    const side: 'home' | 'away' = completed.bracketSlot === slot.feedFrom?.[0] ? 'home' : 'away';
    out.push({ slotId: slot.id, side, teamId });
  }
  return out;
}

// Sport-agnostic fixture generation for the stat tracker.
// Ported & generalised from stat_tracker/Football/src/utils/draw.ts.
// Produces plain fixture descriptors that tracker.routes inserts as TrackerMatch rows,
// plus the session-level `groups` and `bracket` JSON structures.

import { randomUUID } from 'crypto';
import { orderGroup } from './groupRanking';

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

// Round-robin fixtures for ONE group — used when regenerating a group after an
// edit (rename / move / add / remove team).
export function groupRoundRobin(group: GroupDef, startOrder: number): FixtureDescriptor[] {
  const out: FixtureDescriptor[] = [];
  let order = startOrder;
  for (let i = 0; i < group.teamIds.length; i++) {
    for (let j = i + 1; j < group.teamIds.length; j++) {
      out.push({
        stage: 'group', round: group.name, groupId: group.id,
        homeTeamId: group.teamIds[i], awayTeamId: group.teamIds[j], orderIndex: order++,
      });
    }
  }
  return out;
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
/**
 * Standard single-elimination seed positions for a bracket with `size` opening
 * places (a power of two). `positions[i]` is the 1-based SEED that sits in
 * position i, and consecutive positions are a tie:
 *
 *   size 4 → [1, 4, 2, 3]          ties: 1v4, 2v3
 *   size 8 → [1, 8, 4, 5, 2, 7, 3, 6]
 *
 * Built by the usual doubling rule — every seed s in a bracket of n is joined by
 * n+1−s — which is what keeps the top seeds in opposite halves and, when
 * qualifiers are ranked group-winners-first, pairs each winner with a runner-up
 * from a DIFFERENT group.
 */
export function seedPositions(size: number): number[] {
  let arr = [1];
  while (arr.length < size) {
    const n = arr.length * 2;
    const next: number[] = [];
    for (const s of arr) next.push(s, n + 1 - s);
    arr = next;
  }
  return arr;
}

type Tie = { home: string | null; away: string | null };

/**
 * Swap opponents until no tie is two teams out of the same group.
 *
 * The seeding above already avoids this wherever the maths allows, but it cannot
 * always: three groups of two qualifiers leaves seeds 3 and 6 — the third
 * group's winner and its own runner-up — facing each other. Swapping the away
 * sides of two ties fixes that without disturbing the bracket's shape.
 *
 * A tie that no swap can fix is left alone: with a single group there is no
 * cross-group pairing to find, and an unbalanced draw is better than none.
 */
function repairSameGroupTies(ties: Tie[], groupOf: Map<string, string>): void {
  const clash = (t: Tie): boolean => {
    if (!t.home || !t.away) return false;
    const g = groupOf.get(t.home);
    return !!g && g === groupOf.get(t.away);
  };
  for (let i = 0; i < ties.length; i++) {
    if (!clash(ties[i])) continue;
    for (let j = 0; j < ties.length; j++) {
      if (i === j || !ties[j].away) continue;
      const a = ties[i].away, b = ties[j].away;
      ties[i].away = b; ties[j].away = a;
      if (!clash(ties[i]) && !clash(ties[j])) break;
      ties[i].away = a; ties[j].away = b; // no good — put them back
    }
  }
}

/**
 * Fill the opening round from `teamOrder`, which must be in SEED ORDER (best
 * first) — not pre-paired. Pairing is this function's job, so there is one place
 * that decides who meets whom.
 *
 * `groupOf` is supplied when the qualifiers came out of a group stage: it lets
 * the draw guarantee nobody faces a team they have already played in the group.
 *
 * When the bracket has more places than qualifiers the surplus seeds simply do
 * not exist, so the teams drawn against them get byes. Because the top seeds sit
 * opposite the highest seed numbers, those byes land on the best-placed
 * qualifiers and in different halves of the draw — which is what a bye is for.
 */
export function seedFirstRound(
  bracket: BracketDef,
  teamOrder: string[],
  groupOf?: Map<string, string>,
): { seeds: FirstRoundSeed[]; byeAdvances: ByeAdvance[] } {
  const firstStage = bracket.stages[0];
  const firstSlots = bracket.slots.filter((s) => s.stage === firstStage);
  const teams = teamOrder.filter(Boolean);
  const S = firstSlots.length || 1;
  const positions = seedPositions(S * 2);
  const teamAt = (seed: number): string | null => teams[seed - 1] ?? null;

  const ties: Tie[] = [];
  for (let i = 0; i < S; i++) {
    const home = teamAt(positions[i * 2]);
    const away = teamAt(positions[i * 2 + 1]);
    // A bye reads as "this team, no opponent", so never leave the empty side first.
    ties.push(home ? { home, away } : { home: away, away: null });
  }
  if (groupOf) repairSameGroupTies(ties, groupOf);

  const seeds: FirstRoundSeed[] = [];
  const byeAdvances: ByeAdvance[] = [];
  firstSlots.forEach((slot, i) => {
    const { home, away } = ties[i];
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

/**
 * Build one group's (or league's) table.
 *
 * `matches` must be that group's own matches and `teamIds` its own teams —
 * basketball breaks ties on the games the tied teams played against each other,
 * which is only meaningful inside a single group.
 */
export function computeStandings(
  teamIds: string[],
  matches: { homeTeamId?: string | null; awayTeamId?: string | null; homeScore: number; awayScore: number; status: string }[],
  sport?: string | null,
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
  return orderGroup([...table.values()], matches, sport);
}

/**
 * The qualifiers in SEED ORDER — every group's winner first (in group order),
 * then every runner-up, and so on. Seed 1 is group A's winner, seed 2 group B's,
 * seed 3 group A's runner-up …
 *
 * Rank-major is the whole trick. Feed this to seedFirstRound's standard bracket
 * positions and a winner is always drawn against a runner-up from another group:
 * with two groups, seeds [A1, B1, A2, B2] and positions [1,4,2,3] give A1 v B2
 * and B1 v A2. Listing the qualifiers group by group instead — [A1, A2, B1, B2]
 * — pairs 1 v 4 as A1 v B2 but 2 v 3 as A2 v B1 only by accident, and breaks
 * outright at four groups.
 *
 * Returns seed order, NOT pre-paired ties: pairing belongs to seedFirstRound,
 * which is the only place that knows how big the bracket is.
 */
export function seedOrderFromGroups(
  groups: GroupDef[],
  standings: Standing[],
  advancePerGroup: number,
): string[] {
  const rankIn = (teamIds: string[]) =>
    standings.filter((s) => teamIds.includes(s.teamId)).map((s) => s.teamId);
  const qualifiers = groups.map((g) => rankIn(g.teamIds).slice(0, advancePerGroup));

  const seeds: string[] = [];
  for (let rank = 0; rank < advancePerGroup; rank++) {
    qualifiers.forEach((q) => { if (q[rank]) seeds.push(q[rank]); });
  }
  return seeds;
}

/** teamId → the group it qualified from, so a draw can keep group rivals apart. */
export function groupOfTeams(groups: GroupDef[]): Map<string, string> {
  const map = new Map<string, string>();
  groups.forEach((g) => g.teamIds.forEach((id) => map.set(id, g.id)));
  return map;
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

// ─── Group fixture reconciliation ────────────────────────────────────────────
// Editing a group used to mean deleting every fixture in it and regenerating —
// which threw away results that had already been played. A group edit should
// only ever touch fixtures that HAVEN'T happened yet.

/** A match has been played once it is no longer merely SCHEDULED. */
export const PLAYED_MATCH_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'PUBLISHED'] as const;
export const isPlayed = (status: string | null | undefined): boolean =>
  (PLAYED_MATCH_STATUSES as readonly string[]).includes(status ?? '');

export interface ExistingGroupMatch {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  status: string;
}

export interface GroupFixturePlan {
  /** Untouched: already played, or a still-valid pairing. */
  keep: string[];
  /** Unplayed fixtures whose pairing no longer exists in the group. */
  remove: string[];
  /** Pairings the new composition needs that don't exist yet. */
  create: FixtureDescriptor[];
  /** Teams that have already played here — they cannot be moved out. */
  playedTeamIds: string[];
}

/** Unordered pair identity — home/away order is arbitrary for a round robin. */
const pairKey = (a: string | null, b: string | null) => [a ?? '', b ?? ''].sort().join('|');

/**
 * Reconcile ONE group's fixtures against a new composition.
 *
 * Played matches are untouchable — they are the record of something that
 * happened. Unplayed fixtures are disposable: any whose pairing is no longer in
 * the group is dropped, and any missing pairing is created. The result is that
 * adding or removing a team re-plans only the fixtures still to come.
 */
export function planGroupFixtures(
  group: GroupDef,
  existing: ExistingGroupMatch[],
  startOrder: number,
): GroupFixturePlan {
  const inGroup = new Set(group.teamIds);
  const keep: string[] = [];
  const remove: string[] = [];
  const covered = new Set<string>();
  const playedTeams = new Set<string>();

  for (const m of existing) {
    const key = pairKey(m.homeTeamId, m.awayTeamId);
    if (isPlayed(m.status)) {
      keep.push(m.id);
      covered.add(key);
      if (m.homeTeamId) playedTeams.add(m.homeTeamId);
      if (m.awayTeamId) playedTeams.add(m.awayTeamId);
      continue;
    }
    const bothStillInGroup =
      !!m.homeTeamId && !!m.awayTeamId && inGroup.has(m.homeTeamId) && inGroup.has(m.awayTeamId);
    if (bothStillInGroup) {
      keep.push(m.id);
      covered.add(key);
    } else {
      remove.push(m.id);
    }
  }

  const create: FixtureDescriptor[] = [];
  let order = startOrder;
  for (let i = 0; i < group.teamIds.length; i++) {
    for (let j = i + 1; j < group.teamIds.length; j++) {
      const key = pairKey(group.teamIds[i], group.teamIds[j]);
      if (covered.has(key)) continue;
      covered.add(key);
      create.push({
        stage: 'group', round: group.name, groupId: group.id,
        homeTeamId: group.teamIds[i], awayTeamId: group.teamIds[j], orderIndex: order++,
      });
    }
  }

  return { keep, remove, create, playedTeamIds: [...playedTeams] };
}

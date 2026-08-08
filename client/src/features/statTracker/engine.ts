// Network-free tournament engine for the stat tracker.
//
// This mirrors the server's fixture generation + progression so the demo can run
// an entire tournament in memory. Keep this in sync with:
//   server/src/services/trackerDraw.ts   (draw + standings + seeding)
//   server/src/routes/tracker.routes.ts  (propagateBracket / maybeSeedKnockout)
//
// The real admin dashboard never uses this — the server owns progression there.
// It exists so the demo sandbox behaves identically without a backend.

import type {
  TrackerSession,
  TrackerMatch,
  TrackerFormat,
  TrackerConfig,
  TrackerSport,
  GroupDef,
  BracketDef,
  BracketSlotDef,
  RosterTeam,
} from './types';
import { standingsFor, type StandingRow } from './stats';

type Stage = 'group' | 'league' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'third_place';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export const STAGE_LABEL: Record<string, string> = {
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

// A blank fixture with all TrackerMatch fields populated.
function blankMatch(
  sessionId: string,
  orderIndex: number,
  fields: Partial<TrackerMatch>,
): TrackerMatch {
  return {
    id: uid(),
    sessionId,
    stage: 'league',
    round: null,
    groupId: null,
    bracketSlot: null,
    feedsInto: null,
    orderIndex,
    homeTeamId: null,
    awayTeamId: null,
    homeScore: 0,
    awayScore: 0,
    status: 'SCHEDULED',
    state: null,
    publishedMatchId: null,
    ...fields,
  };
}

// ─── Groups ──────────────────────────────────────────────────
function buildGroups(teamIds: string[], groupCount: number): GroupDef[] {
  const shuffled = shuffle(teamIds);
  const groups: GroupDef[] = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push({ id: uid(), name: `Group ${String.fromCharCode(65 + i)}`, teamIds: [] });
  }
  shuffled.forEach((id, idx) => groups[idx % groupCount].teamIds.push(id));
  return groups;
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

// feedsInto: invert feedFrom — each feeder slot points at the slot it feeds.
function feedsIntoMap(bracket: BracketDef): Map<string, string> {
  const map = new Map<string, string>();
  bracket.slots.forEach((slot) => {
    (slot.feedFrom ?? []).forEach((fromId) => {
      if (fromId) map.set(fromId, slot.id);
    });
  });
  return map;
}

function bracketMatches(
  sessionId: string,
  bracket: BracketDef,
  seedOrder: string[] | null,
  startOrder: number,
): TrackerMatch[] {
  const feedsInto = feedsIntoMap(bracket);
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
    return blankMatch(sessionId, order++, {
      stage: slot.stage,
      round: STAGE_LABEL[slot.stage],
      bracketSlot: slot.id,
      feedsInto: feedsInto.get(slot.id) ?? null,
      homeTeamId: seed?.home ?? null,
      awayTeamId: seed?.away ?? null,
    });
  });
}

// ─── Public: build a full in-memory session ──────────────────
export function buildSession(opts: {
  tournamentId: string;
  sport: TrackerSport;
  format: TrackerFormat;
  roster: RosterTeam[];
  config?: TrackerConfig;
}): TrackerSession {
  const sessionId = uid();
  const teamIds = opts.roster.map((t) => t.teamId);
  const config = opts.config ?? {};

  let groups: GroupDef[] = [];
  let bracket: BracketDef | null = null;
  let matches: TrackerMatch[] = [];

  if (opts.format === 'LEAGUE') {
    let order = 0;
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        matches.push(blankMatch(sessionId, order++, {
          stage: 'league', round: STAGE_LABEL.league,
          homeTeamId: teamIds[i], awayTeamId: teamIds[j],
        }));
      }
    }
  } else if (opts.format === 'KNOCKOUT') {
    bracket = buildBracket(teamIds.length, !!config.thirdPlace);
    matches = bracketMatches(sessionId, bracket, shuffle(teamIds), 0);
  } else {
    // MIXED: group stage + (seeded-later) knockout
    const groupsCount = Math.max(1, config.groupsCount ?? 2);
    const advancePerGroup = Math.max(1, config.advancePerGroup ?? 2);
    groups = buildGroups(teamIds, groupsCount);
    let order = 0;
    groups.forEach((g) => {
      for (let i = 0; i < g.teamIds.length; i++) {
        for (let j = i + 1; j < g.teamIds.length; j++) {
          matches.push(blankMatch(sessionId, order++, {
            stage: 'group', round: g.name, groupId: g.id,
            homeTeamId: g.teamIds[i], awayTeamId: g.teamIds[j],
          }));
        }
      }
    });
    bracket = buildBracket(groupsCount * advancePerGroup, !!config.thirdPlace);
    matches.push(...bracketMatches(sessionId, bracket, null, matches.length));
  }

  return {
    id: sessionId,
    tournamentId: opts.tournamentId,
    sport: opts.sport,
    format: opts.format,
    groups: groups.length ? groups : null,
    bracket,
    config,
    roster: opts.roster,
    matches,
  };
}

// ─── Seeding + progression (mirror of tracker.routes.ts) ─────
const DONE = (s: string) => s === 'COMPLETED' || s === 'PUBLISHED';

function winner(m: TrackerMatch): string | null {
  if (!m.homeTeamId || !m.awayTeamId || m.homeScore === m.awayScore) return null;
  return m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
}
function loser(m: TrackerMatch): string | null {
  if (!m.homeTeamId || !m.awayTeamId || m.homeScore === m.awayScore) return null;
  return m.homeScore > m.awayScore ? m.awayTeamId : m.homeTeamId;
}

function seedOrderFromGroups(
  groups: GroupDef[],
  standings: StandingRow[],
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

/** Pure progression: seed the knockout from finished groups, then fill every
 *  bracket slot from its completed feeders. Idempotent — only fills empty sides,
 *  never overwrites teams already assigned or a match already in progress. */
export function progress(session: TrackerSession): TrackerSession {
  const bracket = session.bracket;
  const matches = session.matches.map((m) => ({ ...m }));
  const bySlot = new Map<string, TrackerMatch>();
  matches.forEach((m) => { if (m.bracketSlot) bySlot.set(m.bracketSlot, m); });

  // 1. MIXED: seed first knockout round once every group match is done.
  const groups = session.groups ?? [];
  if (groups.length && bracket && bracket.stages.length) {
    const groupMatches = matches.filter((m) => m.stage === 'group');
    const allGroupsDone = groupMatches.length > 0 && groupMatches.every((m) => DONE(m.status));
    const firstStage = bracket.stages[0];
    const firstSlots = bracket.slots.filter((s) => s.stage === firstStage);
    const alreadySeeded = firstSlots.some((s) => {
      const m = bySlot.get(s.id);
      return m && (m.homeTeamId || m.awayTeamId);
    });
    if (allGroupsDone && !alreadySeeded) {
      const advancePerGroup = session.config?.advancePerGroup ?? 2;
      // Ranked PER GROUP, not as one combined table: basketball breaks ties on
      // the games the tied teams played against each other, and teams in
      // different groups never meet. Concatenating the ranked groups keeps
      // seedOrderFromGroups' per-group filter reading them in the right order.
      const standings = groups.flatMap((g) =>
        standingsFor(
          { ...session, matches: groupMatches.filter((m) => m.groupId === g.id) },
          g.teamIds,
        ),
      );
      const order = seedOrderFromGroups(groups, standings, advancePerGroup);
      firstSlots.forEach((slot, i) => {
        const m = bySlot.get(slot.id);
        if (!m) return;
        if (!m.homeTeamId) m.homeTeamId = order[i * 2] ?? null;
        if (!m.awayTeamId) m.awayTeamId = order[i * 2 + 1] ?? null;
      });
    }
  }

  // 2. Propagate winners/losers into the slots they feed (in stage order).
  if (bracket) {
    for (let s = 1; s < bracket.stages.length; s++) {
      const stage = bracket.stages[s];
      bracket.slots.filter((slot) => slot.stage === stage).forEach((slot) => {
        const target = bySlot.get(slot.id);
        if (!target) return;
        const [feedA, feedB] = slot.feedFrom ?? [];
        const pick = slot.stage === 'third_place' ? loser : winner;
        const fromA = feedA ? bySlot.get(feedA) : undefined;
        const fromB = feedB ? bySlot.get(feedB) : undefined;
        if (!target.homeTeamId && fromA && DONE(fromA.status)) target.homeTeamId = pick(fromA);
        if (!target.awayTeamId && fromB && DONE(fromB.status)) target.awayTeamId = pick(fromB);
      });
    }
  }

  return { ...session, matches };
}

/** Mark a match completed with the given result, then run progression. */
export function applyResult(
  session: TrackerSession,
  matchId: string,
  result: { homeScore: number; awayScore: number; state?: TrackerMatch['state'] },
): TrackerSession {
  const matches = session.matches.map((m) =>
    m.id === matchId
      ? {
          ...m,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          state: result.state ?? m.state,
          status: 'COMPLETED' as const,
        }
      : m,
  );
  return progress({ ...session, matches });
}

/** The tournament champion once the final is decided, else null. */
export function champion(session: TrackerSession): string | null {
  const final = session.matches.find((m) => m.stage === 'final');
  if (!final || !DONE(final.status)) return null;
  return winner(final);
}

// Shared types for the admin stat tracker. The `state` blobs mirror what the
// server stores on TrackerMatch.state and what server/src/services/trackerStats.ts
// reads at publish time — keep the field names in sync with that file.

import type { BasketballVariant } from '@af1/core';

export type TrackerFormat = 'LEAGUE' | 'KNOCKOUT' | 'MIXED';
export type TrackerSport = 'BASKETBALL' | 'FOOTBALL';
export type TrackerMatchStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'PUBLISHED';

export interface RosterPlayer {
  userId: string;
  name: string;
  position: string | null;
  number: number | null;
}
export interface RosterTeam {
  teamId: string;
  name: string;
  players: RosterPlayer[];
}

export interface GroupDef {
  id: string;
  name: string;
  teamIds: string[];
}

export interface BracketSlotDef {
  id: string;
  stage: string;
  feedFrom?: [string?, string?];
}
export interface BracketDef {
  stages: string[];
  slots: BracketSlotDef[];
  includesThirdPlace: boolean;
}

export interface TrackerMatch {
  id: string;
  sessionId: string;
  stage: string;
  round: string | null;
  groupId: string | null;
  bracketSlot: string | null;
  feedsInto: string | null;
  orderIndex: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number;
  awayScore: number;
  status: TrackerMatchStatus;
  scheduledAt?: string | null; // present from the server; omitted by the client-only demo
  court?: string | null;
  state: FootballState | BasketballState | null;
  publishedMatchId: string | null;
  /**
   * Where a PUBLISHED result came from — 'TRACKER' (scored live) or 'MANUAL' (a
   * box score typed in afterwards). Null until published. Read from the platform
   * Match by the session endpoint; the demo tracker omits it.
   */
  statsSource?: 'TRACKER' | 'MANUAL' | null;
}

export interface TrackerSession {
  id: string;
  tournamentId: string;
  sport: TrackerSport;
  /**
   * Which basketball code. Absent on a session created before 3x3 existed (and
   * on every football session), which reads as 5v5 through rulesFor().
   */
  variant?: BasketballVariant | null;
  format: TrackerFormat;
  groups: GroupDef[] | null;
  bracket: BracketDef | null;
  config: TrackerConfig | null;
  roster: RosterTeam[] | null;
  matches: TrackerMatch[];
}

export interface TrackerConfig {
  groupsCount?: number;
  advancePerGroup?: number;
  thirdPlace?: boolean;
  halfLengthSeconds?: number;
  /** Length of one period. A 3x3 period is 10 minutes, a 5v5 quarter 12 — the
   *  server fills the right default in when a session is created. */
  quarterSeconds?: number;
}

// ─── Football live state ─────────────────────────────────────
export type FootballEventType =
  | 'goal' | 'assist' | 'tackle' | 'shot_on' | 'shot_off'
  | 'save' | 'pass_complete' | 'pass_incomplete' | 'yellow_card' | 'red_card';

export interface FootballEvent {
  id: string;
  type: FootballEventType;
  playerId: string; // platform userId
  teamId: string;
  half: 1 | 2;
  minute: number;
  second: number;
  isPenalty?: boolean;
  createdAt: number;
}
export interface FootballSub {
  id: string;
  teamId: string;
  outPlayerId: string;
  inPlayerId: string;
  half: 1 | 2;
  minute: number;
}
export interface FootballState {
  startedAt?: number;
  half: 1 | 2;
  halfLengthSeconds: number;
  elapsedSeconds: number;
  clockRunning: boolean;
  lastTickAt?: number;
  homeLineup: string[];
  awayLineup: string[];
  startingHome: string[];
  startingAway: string[];
  events: FootballEvent[];
  substitutions: FootballSub[];
}

// ─── Basketball live state ───────────────────────────────────
export interface BasketballPlayer {
  teamId: string;
  secondsPlayed: number;
  // reb is the TOTAL (oreb + dreb), kept in step for existing surfaces; oreb/dreb
  // are the split. fg/fga are TOTAL field goals (2pt + 3pt); 2-pt makes = fg - tp.
  pts: number; ast: number; reb: number; oreb: number; dreb: number; stl: number; blk: number;
  fg: number; fga: number; tp: number; tpa: number; ft: number; fta: number; to: number;
  pf: number; // personal fouls
}
export type BasketballActionKind =
  | 'FG_MADE' | 'FG_MISS' | '3PT_MADE' | '3PT_MISS' | 'FT_MADE' | 'FT_MISS'
  | 'AST' | 'REB' | 'OREB' | 'DREB' | 'STL' | 'BLK' | 'TO' | 'PF';
export interface BasketballLogEntry {
  id: string;
  playerId: string;
  kind: BasketballActionKind;
}
export interface BasketballState {
  startedAt?: number;
  quarter: number;
  quarterSeconds: number;
  clockSeconds: number;
  clockRunning: boolean;
  clockLastStartMs?: number;
  onCourtHome: string[];
  onCourtAway: string[];
  players: Record<string, BasketballPlayer>;
  // Team fouls per quarter (index = quarter - 1) — drives the live bonus indicator.
  teamFoulsHome: number[];
  teamFoulsAway: number[];
  log: BasketballLogEntry[];
}

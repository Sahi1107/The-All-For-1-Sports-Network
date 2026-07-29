// Derive platform per-player stat entries from a tracker match's live `state`
// JSON, at publish time. Football is event-sourced; basketball stores running
// per-player tallies. Output matches the PlayerStatEntry shape consumed by
// writeMatchPlayerStats().

import type { PlayerStatEntry } from './matchStats';
import type { Sport } from '@prisma/client';

interface FootballEvent {
  type: string;
  playerId: string; // platform userId
  half?: number;
  minute?: number;
}
interface FootballSub {
  outPlayerId: string;
  inPlayerId: string;
  minute?: number;
}
interface FootballState {
  elapsedSeconds?: number;
  halfLengthSeconds?: number;
  startingHome?: string[];
  startingAway?: string[];
  events?: FootballEvent[];
  substitutions?: FootballSub[];
}

interface BasketballPlayer {
  secondsPlayed?: number;
  pts?: number; ast?: number; reb?: number; oreb?: number; dreb?: number; stl?: number; blk?: number;
  fg?: number; tp?: number; ft?: number; to?: number; pf?: number;
}
interface BasketballState {
  players?: Record<string, BasketballPlayer>;
}

function deriveFootball(state: FootballState): PlayerStatEntry[] {
  const events = state.events ?? [];
  const subs = state.substitutions ?? [];
  const matchMinutes = Math.round((state.elapsedSeconds ?? (state.halfLengthSeconds ?? 2700) * 2) / 60);

  const byPlayer = new Map<string, Record<string, number>>();
  const get = (id: string) => {
    let s = byPlayer.get(id);
    if (!s) {
      s = { goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, yellowCards: 0, redCards: 0, minutesPlayed: 0 };
      byPlayer.set(id, s);
    }
    return s;
  };

  for (const e of events) {
    if (!e.playerId) continue;
    const s = get(e.playerId);
    switch (e.type) {
      case 'goal': s.goals++; s.shots++; break;
      case 'assist': s.assists++; break;
      case 'tackle': s.tackles++; break;
      case 'shot_on':
      case 'shot_off': s.shots++; break;
      case 'save': s.saves++; break;
      case 'pass_complete': s.passes++; break;
      case 'yellow_card': s.yellowCards++; break;
      case 'red_card': s.redCards++; break;
    }
  }

  // Minutes: starters play until subbed off; substitutes from when they come on.
  const starters = new Set([...(state.startingHome ?? []), ...(state.startingAway ?? [])]);
  const subbedOffAt = new Map<string, number>();
  const subbedOnAt = new Map<string, number>();
  for (const sub of subs) {
    if (sub.outPlayerId) subbedOffAt.set(sub.outPlayerId, sub.minute ?? matchMinutes);
    if (sub.inPlayerId) subbedOnAt.set(sub.inPlayerId, sub.minute ?? 0);
  }
  starters.forEach((id) => {
    const s = get(id);
    s.minutesPlayed = subbedOffAt.has(id) ? subbedOffAt.get(id)! : matchMinutes;
  });
  subbedOnAt.forEach((minute, id) => {
    const s = get(id);
    s.minutesPlayed = Math.max(0, matchMinutes - minute);
  });

  return [...byPlayer.entries()].map(([userId, stats]) => ({ userId, stats }));
}

function deriveBasketball(state: BasketballState): PlayerStatEntry[] {
  const players = state.players ?? {};
  return Object.entries(players).map(([userId, p]) => ({
    userId,
    stats: {
      points: p.pts ?? 0,
      // reb is kept as the total; fall back to off+def if an older blob lacks it.
      rebounds: p.reb ?? ((p.oreb ?? 0) + (p.dreb ?? 0)),
      offRebounds: p.oreb ?? 0,
      defRebounds: p.dreb ?? 0,
      assists: p.ast ?? 0,
      steals: p.stl ?? 0,
      blocks: p.blk ?? 0,
      // fg is TOTAL field goals (2pt + 3pt); 2-pt makes = fg - tp.
      twoPointers: Math.max(0, (p.fg ?? 0) - (p.tp ?? 0)),
      threePointers: p.tp ?? 0,
      freeThrows: p.ft ?? 0,
      turnovers: p.to ?? 0,
      personalFouls: p.pf ?? 0,
      minutesPlayed: Math.round(((p.secondsPlayed ?? 0) / 60) * 10) / 10,
    },
  }));
}

export function derivePlayerStats(sport: Sport, state: unknown): PlayerStatEntry[] {
  if (!state || typeof state !== 'object') return [];
  if (sport === 'FOOTBALL') return deriveFootball(state as FootballState);
  if (sport === 'BASKETBALL') return deriveBasketball(state as BasketballState);
  return [];
}

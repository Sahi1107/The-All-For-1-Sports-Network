import { renderCardPng, type CardFormat } from './render';
import {
  bandFor, loadCardUser, identityFor, clubFor,
  matchCardData, tournamentCardData, careerCardData, rankingCardData, profileCardData,
  listMatchCardOptions, type MatchCardOption,
} from './data';
import { isStatSport, type StatSport } from '../../data/careerStats';
import {
  matchCardStory, matchCardSquare, tournamentCardStory, careerCardStory,
  rankingCardStory, rankingCardSquare, profileCardStory,
} from './cards';

// Orchestrators: authenticated athlete → age-band gate → fresh data read →
// satori render. Every builder returns null when there is nothing to render
// (no stat row, un-published match, no ranking) so the route can 404 honestly.

export class CardBlockedError extends Error {
  constructor() { super('Story cards are not available for this account'); }
}

export type CardType = 'match' | 'tournament' | 'career' | 'ranking' | 'profile';

export interface BuiltCard { buffer: Buffer; filename: string }

/** A match card prepared for the feed: the square PNG plus the stat payload
 *  derived from the same persisted row (the post's accessible text summary). */
export interface MatchPostCard {
  performance: { statValue: string; statLabel: string; eyebrow: string; context: string };
  buffer: Buffer;
}

async function prepare(userId: string) {
  const user = await loadCardUser(userId);
  if (!user) throw new CardBlockedError();
  const band = bandFor(user);
  if (band === 'BLOCKED') throw new CardBlockedError();
  const club = await clubFor(userId);
  const identity = await identityFor(user, band, club);
  return { user, band, club, identity };
}

const requireStatSport = (sport: string | null): StatSport | null =>
  sport && isStatSport(sport) ? sport : null;

export async function buildMatchCard(userId: string, matchId: string, format: CardFormat): Promise<BuiltCard | null> {
  const { user, identity } = await prepare(userId);
  const sport = requireStatSport(user.sport);
  if (!sport) return null;
  const data = await matchCardData(userId, matchId, sport);
  if (!data) return null;
  const element = format === 'square' ? matchCardSquare(data, identity) : matchCardStory(data, identity);
  return { buffer: await renderCardPng(element, format), filename: `${identity.slug}-match.png` };
}

/** The athlete's own played matches, as options for the composer's picker.
 *  Behind the same age gate as every card: a blocked account gets none. */
export async function listPostableMatches(userId: string): Promise<MatchCardOption[]> {
  const { user } = await prepare(userId);
  const sport = requireStatSport(user.sport);
  if (!sport) return [];
  return listMatchCardOptions(userId, sport);
}

/** A match card ready to be POSTED to the feed. Both the image and the stat
 *  payload are built here from the persisted stat row: the athlete chooses which
 *  match, never what the numbers say, so a stat post can't be self-reported.
 *  Square (1080×1080) because it is going into a feed, not a story. */
export async function buildMatchPostCard(userId: string, matchId: string): Promise<MatchPostCard | null> {
  const { user, identity } = await prepare(userId);
  const sport = requireStatSport(user.sport);
  if (!sport) return null;
  const data = await matchCardData(userId, matchId, sport);
  if (!data) return null;
  return {
    performance: {
      statValue: String(data.hero.value),
      // Sliced to the same limits the PerformancePayload schema enforces, so a
      // long round or tournament name can't write an oversized row.
      statLabel: data.hero.label.slice(0, 16),
      eyebrow: data.roundLine.slice(0, 40),
      context: `${data.playerTeam.name} ${data.playerTeam.score}–${data.opponent.score} ${data.opponent.name} · ${data.metaLine}`.slice(0, 120),
    },
    buffer: await renderCardPng(matchCardSquare(data, identity), 'square'),
  };
}

export async function buildTournamentCard(userId: string, tournamentId: string): Promise<BuiltCard | null> {
  const { user, identity } = await prepare(userId);
  const sport = requireStatSport(user.sport);
  if (!sport) return null;
  const data = await tournamentCardData(userId, tournamentId, sport);
  if (!data) return null;
  return { buffer: await renderCardPng(tournamentCardStory(data, identity), 'story'), filename: `${identity.slug}-tournament.png` };
}

export async function buildCareerCard(userId: string): Promise<BuiltCard | null> {
  const { user, identity } = await prepare(userId);
  const sport = requireStatSport(user.sport);
  if (!sport) return null;
  const data = await careerCardData(userId, sport);
  if (!data) return null;
  return { buffer: await renderCardPng(careerCardStory(data, identity), 'story'), filename: `${identity.slug}-career.png` };
}

export async function buildRankingCard(userId: string, format: CardFormat): Promise<BuiltCard | null> {
  const { identity } = await prepare(userId);
  const data = await rankingCardData(userId);
  if (!data) return null;
  const element = format === 'square' ? rankingCardSquare(data, identity) : rankingCardStory(data, identity);
  return { buffer: await renderCardPng(element, format), filename: `${identity.slug}-ranking.png` };
}

export async function buildProfileCard(userId: string): Promise<BuiltCard | null> {
  const { user, identity, club } = await prepare(userId);
  const data = await profileCardData(user, club);
  return { buffer: await renderCardPng(profileCardStory(data, identity), 'story'), filename: `${identity.slug}-profile.png` };
}

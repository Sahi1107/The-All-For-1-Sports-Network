import type { Prisma, PrismaClient, Sport } from '@prisma/client';
import prisma from '../config/db';

export interface PlayerStatEntry {
  userId: string;
  stats?: Record<string, unknown>;
}

type Db = PrismaClient | Prisma.TransactionClient;

const num = (v: unknown): number => Number(v ?? 0);

/**
 * Upsert per-player stat rows for a completed match into the correct
 * sport-specific table. Whitelists fields to prevent mass assignment.
 *
 * Shared by the admin match-result route and the stat-tracker publish flow.
 */
export async function writeMatchPlayerStats(
  args: {
    matchId: string;
    tournamentId: string;
    sport: Sport;
    playerStats: PlayerStatEntry[];
  },
  db: Db = prisma,
): Promise<void> {
  const { matchId, tournamentId, sport, playerStats } = args;
  if (!Array.isArray(playerStats)) return;
  const base = { matchId, tournamentId };

  for (const entry of playerStats) {
    if (!entry?.userId || typeof entry.userId !== 'string') continue;
    const s = entry.stats ?? {};

    if (sport === 'BASKETBALL') {
      const data = {
        points: num(s.points),
        rebounds: num(s.rebounds),
        assists: num(s.assists),
        steals: num(s.steals),
        blocks: num(s.blocks),
        threePointers: num(s.threePointers),
        freeThrows: num(s.freeThrows),
        turnovers: num(s.turnovers),
        minutesPlayed: num(s.minutesPlayed),
      };
      await db.basketballStats.upsert({
        where: { matchId_userId: { matchId, userId: entry.userId } },
        create: { ...base, userId: entry.userId, ...data },
        update: data,
      });
    } else if (sport === 'FOOTBALL') {
      const data = {
        goals: num(s.goals),
        assists: num(s.assists),
        shots: num(s.shots),
        passes: num(s.passes),
        tackles: num(s.tackles),
        saves: num(s.saves),
        yellowCards: num(s.yellowCards),
        redCards: num(s.redCards),
        minutesPlayed: num(s.minutesPlayed),
      };
      await db.footballStats.upsert({
        where: { matchId_userId: { matchId, userId: entry.userId } },
        create: { ...base, userId: entry.userId, ...data },
        update: data,
      });
    } else if (sport === 'CRICKET') {
      const data = {
        runs: num(s.runs),
        ballsFaced: num(s.ballsFaced),
        fours: num(s.fours),
        sixes: num(s.sixes),
        wickets: num(s.wickets),
        oversBowled: num(s.oversBowled),
        runsConceded: num(s.runsConceded),
        catches: num(s.catches),
        runOuts: num(s.runOuts),
        strikeRate: num(s.strikeRate),
        economy: num(s.economy),
      };
      await db.cricketStats.upsert({
        where: { matchId_userId: { matchId, userId: entry.userId } },
        create: { ...base, userId: entry.userId, ...data },
        update: data,
      });
    }
  }
}

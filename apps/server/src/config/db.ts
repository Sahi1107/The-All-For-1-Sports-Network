import { PrismaClient } from '@prisma/client';
import { bustTournament, bustAllTournaments } from '../services/tournamentCache';
import { assertSafeMediaWrite, GUARDED_MEDIA_FIELDS } from '../services/mediaUrlPolicy';

// ── Explicit connection pool sizing ─────────────────────────────────────────
// maxScale (8) × this must stay under the DB's usable connection budget (~47 on
// db-g1-small, shared with allfor1-web). 8 × 4 = 32, safely under. Tune via
// DB_CONNECTION_LIMIT env — no need to touch the DATABASE_URL secret.
function withConnectionLimit(url: string, limit: number): string {
  if (!url || url.includes('connection_limit')) return url;
  return url + (url.includes('?') ? '&' : '?') + `connection_limit=${limit}`;
}

const rawUrl = process.env.DATABASE_URL ?? '';
const limit  = Number(process.env.DB_CONNECTION_LIMIT ?? 4);

const base = new PrismaClient(
  rawUrl ? { datasourceUrl: withConnectionLimit(rawUrl, limit) } : undefined,
);

// ── Tournament read-cache invalidation ──────────────────────────────────────
// Bust the tournament read-cache (services/tournamentCache) on ANY write to a
// tournament-visible model, so a published result / roster change / draw shows
// up immediately — not after the TTL. Precise bust when the tournament id is on
// the returned record; safe clear-all otherwise (batch counts, or TrackerMatch
// which is keyed by session, not tournament).
const CACHE_MODELS = new Set([
  'Tournament', 'TournamentTeam', 'Team', 'TeamMember', 'Match',
  'TrackerSession', 'TrackerMatch', 'BasketballStats', 'FootballStats',
  'CricketStats', 'PlayerRanking',
]);
const WRITE_ACTIONS = new Set([
  'create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany',
]);

const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // ── Media-column write guard ────────────────────────────────────────
        // Enforced here rather than at each call site because this is the only
        // chokepoint every write goes through, including ones written later.
        // See services/mediaUrlPolicy for why the column must never hold an
        // arbitrary URL (server-side readers would become an SSRF primitive).
        if (model && WRITE_ACTIONS.has(operation) && GUARDED_MEDIA_FIELDS[model]) {
          const a = args as { data?: unknown; create?: unknown; update?: unknown };
          assertSafeMediaWrite(model, a.data);
          assertSafeMediaWrite(model, a.create);
          assertSafeMediaWrite(model, a.update);
        }

        const result = await query(args);
        if (model && CACHE_MODELS.has(model) && WRITE_ACTIONS.has(operation)) {
          const r = result as { id?: unknown; tournamentId?: unknown } | null;
          const tid =
            model === 'Tournament'
              ? (r?.id ?? (args as { where?: { id?: unknown } })?.where?.id)
              : r?.tournamentId;
          if (typeof tid === 'string') bustTournament(tid);
          else bustAllTournaments();
        }
        return result;
      },
    },
  },
});

// The $extends client is runtime-compatible with PrismaClient for all query use
// (and its invalidation hook fires inside interactive transactions too); we widen
// the type back so existing call sites that expect PrismaClient keep type-checking.
// $on / $use / $extends are never called on this export.
export default prisma as unknown as PrismaClient;

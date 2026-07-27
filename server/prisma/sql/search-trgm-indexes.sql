-- Trigram (pg_trgm) GIN indexes that make the typeahead's case-insensitive
-- substring match (ILIKE '%term%') index-backed instead of a sequential scan.
--
-- The btree @@index([name]) added in schema.prisma helps ORDER BY name, but a
-- btree can't accelerate ILIKE '%...%'. pg_trgm can — this is the index that
-- keeps /api/search fast as the User/Team/Tournament tables grow.
--
-- Apply ONCE against the production database (idempotent — safe to re-run):
--   psql "$DATABASE_URL" -f server/prisma/sql/search-trgm-indexes.sql
--
-- Not part of `prisma db push` (Prisma doesn't manage extensions / GIN opclasses
-- cleanly), so it's a separate one-time step. CREATE EXTENSION needs privileges
-- the app's runtime role may not have; run it as a superuser / migration role.
-- Uses plain CREATE INDEX (not CONCURRENTLY) so it can run inside a migration
-- transaction; at current table sizes it's instant. For a large live table,
-- switch to CREATE INDEX CONCURRENTLY (outside a transaction) to avoid a write
-- lock.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS user_name_trgm_idx
  ON "User" USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS team_name_trgm_idx
  ON "Team" USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tournament_name_trgm_idx
  ON "Tournament" USING gin (lower(name) gin_trgm_ops);

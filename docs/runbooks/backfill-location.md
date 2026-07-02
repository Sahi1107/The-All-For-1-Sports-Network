# Runbook — Backfill structured location (city/state/region/country)

**Status:** NOT YET RUN. The script is safe-by-default (dry run unless `--commit`),
but run it deliberately, together, after review.

**What this does:** Parses each profile's existing free-text `location` ("City,
State, Country") into the new structured columns `city` / `state` / `region` /
`country`, so Radar can do exact-city → state → region → country widening. It
only fills rows that aren't structured yet (idempotent) and never overwrites.

**Script:** `server/scripts/backfill-location.ts` — reads only in dry run; writes
only with `--commit`. Region resolution and parsing live in
`server/src/data/locations.ts` (six India macro-regions).

---

## ⚠️ Sequencing — the columns must exist first

`city` / `state` / `region` / `country` were added to the Prisma schema but do
**not** exist in production until the schema is applied (`prisma db push` on
deploy, or a manual `ALTER`). Run the backfill only after the columns exist.
Same two orderings as the minor-privacy backfill:

- **Recommended:** add the columns (deploy the schema, or a manual additive
  `ALTER TABLE "User" ADD COLUMN ...`) → dry-run → review → `--commit`.
- The backfill has **no exposure window concern** — Radar keeps using the
  free-text `location` until its engine switches to the structured columns
  (Step 4), so it's fine to backfill before or after that deploy.

---

## Step 0 — Take/confirm a backup (DO NOT SKIP)

Same as the minor-privacy runbook: confirm a restorable backup exists before any
write. Cloud SQL on-demand backup **and** a universal `pg_dump`:

```bash
gcloud sql backups create --instance=INSTANCE_NAME --project=PROJECT_ID
gcloud sql backups list  --instance=INSTANCE_NAME --project=PROJECT_ID   # confirm SUCCESSFUL
pg_dump "$DATABASE_URL" -Fc -f "allfor1-preloc-$(date +%Y%m%d-%H%M%S).dump"
```

Do not proceed until a restorable backup is confirmed.

## Step 1 — Dry run (reads only, writes nothing)

```bash
cd server
DATABASE_URL="<prod url>" npx ts-node scripts/backfill-location.ts
```

Review the summary:
- **Recognized state** — parsed and matched an India region (`region` will be set).
- **Unrecognized state** — parsed, but the state isn't in the region map (region
  stays null: non-India, misspelling, or a legacy format). Eyeball the sample
  parses; a high unrecognized count means the parser or region map needs a look
  before committing.
- **Unparseable** — a `location` string that split into nothing usable (rare).

Confirm the sample `"location" → {parsed}` lines look right.

## Step 2 — Commit (only after review + confirmed backup)

```bash
DATABASE_URL="<prod url>" npx ts-node scripts/backfill-location.ts --commit
```

Writes in batched transactions; prints `Rows written`. Safe to re-run — it only
touches rows still missing all four structured columns.

## Step 3 — Verify

```sql
-- How many profiles now have a resolved region:
SELECT count(*) FROM "User" WHERE region IS NOT NULL;
-- Spot-check a few:
SELECT location, city, state, region, country FROM "User"
WHERE location IS NOT NULL LIMIT 20;
```

## Notes

- **Idempotent & one-directional-safe:** only fills empty structured columns;
  never overwrites, never clears.
- **New signups after the backfill:** wiring registration / edit-profile / bulk
  provisioning to populate these columns on write is a small companion change
  (planned as the next sub-step) so the backfill doesn't go stale. Until that
  lands, re-running the backfill periodically catches new rows.
- If the parser or region map is changed later, re-running is safe — but it still
  won't touch rows already structured; clear those columns first if you need a
  full re-parse.

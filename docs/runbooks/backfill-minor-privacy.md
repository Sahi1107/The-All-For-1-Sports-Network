# Runbook — Privatize existing under-13 accounts (`discoverable` backfill)

**Status:** NOT YET RUN. Execute deliberately, together, after review.
**Why it's urgent:** Existing under-13 accounts predate the new `discoverable`
flag and currently default to `discoverable = true`, so they remain exposed in
search, rankings, and Scout Copilot until this backfill runs.

**What this does:** Sets `discoverable = false` for every existing under-13
account. It only ever flips `true → false`, and only for minors — it can never
expose anyone. Over-inclusion (a borderline account made private) is the safe
failure mode.

---

## Verified facts (from the schema)

- **Database:** PostgreSQL. Schema is applied by `prisma db push` on server boot
  (see `server/Dockerfile`), not migration files.
- **Table name:** `"User"` — the schema has no `@@map`, so Prisma uses the model
  name verbatim. The capital `U` means it **must be double-quoted** in SQL.
- **Columns:** `discoverable` (no `@map`), `guardian_managed`, `age`,
  `date_of_birth`.
- **Under-13 marker:** `guardian_managed = true` is set by the app for under-13
  athletes. We also match on `age`/`date_of_birth` to catch any legacy under-13
  account that predates the "DOB required" rule.

---

## ⚠️ Sequencing — the column must exist first

The `discoverable` column **does not exist in production yet** — it's only in the
(uncommitted) schema. It is created either when the new server deploys
(`prisma db push` adds it with default `true`) or by a manual `ALTER`. The
backfill `UPDATE` can only run once the column exists. Two safe orderings:

- **Option A — recommended, zero exposure window.** Add the column manually
  (Step 2A) and backfill **before** deploying the new code. When the new
  filtering later deploys, minors are already private. `prisma db push` will see
  the column already matches and make no change.
- **Option B — simpler, small exposure window.** Deploy the new code first (adds
  the column, default `true`), then run the backfill **immediately** after.
  Between deploy and backfill, existing minors stay exposed — minimize this gap.

---

## Step 0 — Take/confirm a backup (DO NOT SKIP)

Confirm your DB provider first, then ensure a **restorable** backup exists before
touching any data.

**If Google Cloud SQL** (this project uses a Cloud SQL proxy — `server/cloud-sql-proxy`):
```bash
# On-demand backup
gcloud sql backups create --instance=INSTANCE_NAME --project=PROJECT_ID

# Verify it completed (status RUNNING → SUCCESSFUL)
gcloud sql backups list --instance=INSTANCE_NAME --project=PROJECT_ID
```
Also confirm automated backups + point-in-time recovery are enabled on the
instance.

**If a different managed Postgres (Neon, etc.):** take a snapshot from that
provider's console and confirm it finished.

**Universal logical backup (works regardless of provider) — do this too:**
```bash
pg_dump "$DATABASE_URL" -Fc -f "allfor1-preflight-$(date +%Y%m%d-%H%M%S).dump"
ls -lh allfor1-preflight-*.dump   # confirm the file exists and size > 0
```

**Do not proceed past this step until you can confirm a restorable backup.**

---

## Step 1 — Connect to the PRODUCTION database

Use the Cloud SQL proxy + `psql`, or `gcloud sql connect INSTANCE_NAME --user=DB_USER --database=DB_NAME`.

Confirm you are on the right database before running anything:
```sql
SELECT current_database(), current_user;
```

---

## Step 2 — Confirm the table and column

```sql
-- Table should return exactly one row: 'User'
SELECT table_name FROM information_schema.tables WHERE table_name = 'User';

-- Column: returns a row only after Step 2A (Option A) or the deploy (Option B)
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'User' AND column_name = 'discoverable';
```

### Step 2A — (Option A only) add the column to match Prisma exactly

This DDL is exactly what `prisma db push` generates for
`discoverable Boolean @default(true)`, so the later deploy is a no-op on it:
```sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discoverable" boolean NOT NULL DEFAULT true;
```

---

## Step 3 — DRY RUN (read-only): see exactly who will be affected

Run this **before** the update. Same predicate as the `UPDATE`, so the row count
is precisely what the backfill will change. Eyeball the rows.
```sql
SELECT id, name, role, age, date_of_birth, guardian_managed, discoverable
FROM "User"
WHERE discoverable = true
  AND (
        guardian_managed = true
     OR (age IS NOT NULL AND age < 13)
     OR (date_of_birth IS NOT NULL AND date_of_birth > (CURRENT_DATE - INTERVAL '13 years'))
      )
ORDER BY guardian_managed DESC, age;

-- Just the count:
SELECT count(*) AS will_privatize
FROM "User"
WHERE discoverable = true
  AND (
        guardian_managed = true
     OR (age IS NOT NULL AND age < 13)
     OR (date_of_birth IS NOT NULL AND date_of_birth > (CURRENT_DATE - INTERVAL '13 years'))
      );
```

---

## Step 4 — Backfill inside a transaction

```sql
BEGIN;

UPDATE "User"
SET discoverable = false
WHERE discoverable = true
  AND (
        guardian_managed = true
     OR (age IS NOT NULL AND age < 13)
     OR (date_of_birth IS NOT NULL AND date_of_birth > (CURRENT_DATE - INTERVAL '13 years'))
      );

-- psql prints "UPDATE <n>". Confirm <n> == the dry-run count from Step 3.
-- If it matches and looks correct:
COMMIT;

-- If ANYTHING looks off, instead run:
-- ROLLBACK;
```

---

## Step 5 — Verify

```sql
-- Should now return 0:
SELECT count(*) AS still_exposed
FROM "User"
WHERE discoverable = true
  AND (
        guardian_managed = true
     OR (age IS NOT NULL AND age < 13)
     OR (date_of_birth IS NOT NULL AND date_of_birth > (CURRENT_DATE - INTERVAL '13 years'))
      );

-- Sanity: every guardian-managed account is now private
SELECT count(*) FROM "User" WHERE guardian_managed = true AND discoverable = true; -- expect 0
```

After the app is deployed, spot-check in the running product that a known minor:
- does **not** appear in `/users` search or `/rankings`,
- is **not** returned by Scout Copilot,
- returns **404** on `GET /users/:id` to a non-guardian account.

---

## Notes

- **Idempotent:** safe to re-run. The `discoverable = true` guard means a second
  run affects 0 rows.
- **Direction is one-way safe:** only `true → false`, only for minors. It cannot
  make anyone newly visible.
- **Criteria rationale:** `guardian_managed` catches app-flagged under-13s;
  `age` / `date_of_birth` catch any legacy under-13 created before DOB was
  required (or via paths that didn't set the flag). Stored `age` may be stale,
  which can privatize a now-13-year-old — acceptable, since private is the safe
  default and a guardian can re-enable discovery in Settings.
- The `UPDATE` is a fast single-table write; keep the transaction open only
  briefly.

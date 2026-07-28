# Disaster Recovery — Database

Recovery procedure for the production database (`allfor1-db`, Cloud SQL Postgres 16,
`allfor1-prod`, region `asia-south1`). **This procedure was tested end-to-end on
2026-07-28** — it is proven, not theoretical.

## What we have (verified)

| Property | Value |
|---|---|
| Automated backups | **On** — daily at 02:00, **7 retained** |
| Point-in-time recovery (PITR) | **On** — 7 days of transaction logs archived to Cloud Storage |
| Availability | **REGIONAL** (survives a zone failure) |
| **RPO** (max data loss) | **Near-zero** — recover to any second within the last 7 days |
| **RTO** (time to a recovered DB) | **~8 min** to provision a clone; **~10–15 min** to full recovery incl. repointing the app |

## Environment constraints (important — they change how you recover)

- **Public IPs are blocked** by org policy (`constraints/sql.restrictPublicIp`). You
  **cannot** connect a laptop via the Cloud SQL Auth Proxy over a public IP, and
  `gcloud sql connect` will not work. Verify restored data via `gcloud sql export`
  (Admin API → GCS), or from inside the VPC.
- **Clones inherit prod safety rails:** deletion protection **on**, and a **mandatory
  final backup (30-day retention)** on delete. Cleanup requires disabling deletion
  protection first, then deleting with `--enable-final-backup`.

## Recovery runbook

Recovery is **clone-then-repoint**, never restore-in-place — so production stays
untouched while you verify the recovered data.

```bash
PROJECT=allfor1-prod
SRC=allfor1-db
RECOVER=allfor1-db-recover          # new instance name
PITR="2026-07-28T09:03:54.000Z"     # RFC3339 UTC — the point to recover to

# 1. Clone the source to a NEW instance at the chosen point in time.
gcloud sql instances clone "$SRC" "$RECOVER" \
  --point-in-time="$PITR" --project "$PROJECT"
# (Provisions in ~8 min; wait for state RUNNABLE.)

# 2. Verify the recovered data (public IP is blocked → export to GCS).
BUCKET="gs://allfor1-recover-verify-$(date +%s)"
CLONE_SA=$(gcloud sql instances describe "$RECOVER" --project "$PROJECT" \
  --format="value(serviceAccountEmailAddress)")
gcloud storage buckets create "$BUCKET" --project "$PROJECT" --location asia-south1
gcloud storage buckets add-iam-policy-binding "$BUCKET" \
  --member="serviceAccount:$CLONE_SA" --role=roles/storage.objectAdmin --project "$PROJECT"
gcloud sql export csv "$RECOVER" "$BUCKET/check.csv" --database=allfor1 --project "$PROJECT" \
  --query='SELECT '"'"'User'"'"' AS entity, count(*)::text FROM "User"
           UNION ALL SELECT '"'"'Message'"'"', count(*)::text FROM "Message"
           UNION ALL SELECT '"'"'latest_notif'"'"', COALESCE(max("createdAt")::text,'"'"'none'"'"') FROM "Notification"'
gcloud storage cat "$BUCKET/check.csv"   # sanity-check counts + recency vs the PITR target

# 3. Cut over: point the app at the recovered instance.
#    Update the DATABASE_URL secret to the recovered instance's connection name,
#    then redeploy allfor1-api. Keep the app DB user/password the same (cloned).
#    (Do NOT print or copy the secret value into a file — edit via Secret Manager.)

# 4. Clean up the failed instance / verification clone.
gcloud storage rm --recursive "$BUCKET" --project "$PROJECT"
gcloud storage buckets delete "$BUCKET" --project "$PROJECT"
gcloud sql instances patch "$RECOVER" --no-deletion-protection --project "$PROJECT" --quiet   # only if deleting
gcloud sql instances delete <instance-to-remove> --project "$PROJECT" --enable-final-backup --quiet
```

## Notes

- **RPO/RTO** above are measured, not guessed (drill on 2026-07-28).
- Credentials live in **Secret Manager** (`DATABASE_URL`, `DATABASE_URL_RO`) — never in
  a local `.env`. Read at runtime, never persisted or printed.
- Re-run this drill after any major schema or infra change, and at least quarterly.
- See also: connection pooling / scaling notes once that work lands.

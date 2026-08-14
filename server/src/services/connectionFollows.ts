import prisma from '../config/db';
import logger from '../utils/logger';

// Connect ⇒ mutual follow (LinkedIn-style). A connection is a stronger relationship
// than a follow, so an accepted connection makes both people follow each other, and
// those follows count in the follower/following numbers everywhere (the counts are
// row counts, so nothing else has to change).
//
// The `viaConnection` flag on Follow is what keeps this reversible without clobbering
// organic follows:
//   • accept    → create the two follows if missing, marked viaConnection (an already
//                 existing organic follow is left as-is, never duplicated/downgraded).
//   • disconnect→ delete only the viaConnection follows for the pair; an organic follow
//                 survives, and one the user manually unfollowed is simply already gone.
//   • unfollow  → deletes a Follow row and never touches the Connection (handled by the
//                 existing unfollow route) — you can stop seeing someone's posts while
//                 staying connected.
//   • block     → still deletes every follow + connection both ways (handled in the
//                 block route), regardless of viaConnection.

/** Make `a` and `b` follow each other because they accepted a connection. Idempotent:
 *  only a missing direction is created; an existing follow of either kind is untouched. */
export async function linkConnectionFollows(a: string, b: string): Promise<void> {
  if (!a || !b || a === b) return;
  await prisma.follow.createMany({
    data: [
      { followerId: a, followingId: b, viaConnection: true },
      { followerId: b, followingId: a, viaConnection: true },
    ],
    skipDuplicates: true, // never a duplicate row; leaves an organic follow as-is
  });
}

/** Remove only the follows a connection created between `a` and `b` (either direction).
 *  Organic follows (viaConnection=false) are preserved. */
export async function unlinkConnectionFollows(a: string, b: string): Promise<void> {
  await prisma.follow.deleteMany({
    where: {
      viaConnection: true,
      OR: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a },
      ],
    },
  });
}

const BACKFILL_KEY = 'connection-follows-backfill-v1';

/**
 * One-time backfill: give every EXISTING accepted connection its mutual follows, so
 * current users' numbers are correct immediately — not just new connections. Guarded
 * by AppMigration so it runs exactly once forever (re-running would resurrect follows
 * users have since deliberately unfollowed). Batched, idempotent (skipDuplicates), and
 * safe under concurrent boots. Returns the number of follow rows created.
 */
export async function backfillConnectionFollowsOnce(): Promise<number | null> {
  const already = await prisma.appMigration.findUnique({ where: { key: BACKFILL_KEY } });
  if (already) return null; // already done

  const BATCH = 1000;
  let cursor: string | undefined;
  let created = 0;
  for (;;) {
    const conns = await prisma.connection.findMany({
      where: { status: 'ACCEPTED' },
      select: { id: true, senderId: true, receiverId: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (conns.length === 0) break;
    const rows = conns.flatMap((c) => [
      { followerId: c.senderId, followingId: c.receiverId, viaConnection: true },
      { followerId: c.receiverId, followingId: c.senderId, viaConnection: true },
    ]);
    const res = await prisma.follow.createMany({ data: rows, skipDuplicates: true });
    created += res.count;
    if (conns.length < BATCH) break;
    cursor = conns[conns.length - 1].id;
  }

  // Record completion. Under a concurrent boot the loser hits P2002 — harmless, the
  // work is idempotent and the flag is now set either way.
  try {
    await prisma.appMigration.create({ data: { key: BACKFILL_KEY } });
  } catch { /* another instance recorded it first */ }
  return created;
}

/** Fire-and-forget boot hook: run the one-time backfill without blocking startup. */
export function runConnectionFollowsBackfill(): void {
  void backfillConnectionFollowsOnce()
    .then((n) => { if (n !== null) logger.info('Connection-follow backfill complete', { rowsCreated: n }); })
    .catch((err) => logger.error('Connection-follow backfill failed (non-fatal)', { err: String(err) }));
}

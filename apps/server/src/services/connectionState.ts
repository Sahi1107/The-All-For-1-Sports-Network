import prisma from '../config/db';

// The viewer's connection relationship to another user, for discovery surfaces so
// a Connect button renders in the right state on first paint (not "Connect" for
// someone already connected). REJECTED is reported as 'none' — a fresh request is
// allowed (subject to the cooldown, which the request endpoint enforces).
export type ConnState = 'none' | 'pending_out' | 'pending_in' | 'connected';

/** Map each of `userIds` to the viewer's connection state with that user. */
export async function connectionStatesFor(
  viewerId: string,
  userIds: string[],
): Promise<Map<string, ConnState>> {
  const map = new Map<string, ConnState>();
  const ids = [...new Set(userIds.filter((id) => id && id !== viewerId))];
  if (!ids.length) return map;

  const rows = await prisma.connection.findMany({
    where: {
      OR: [
        { senderId: viewerId, receiverId: { in: ids } },
        { senderId: { in: ids }, receiverId: viewerId },
      ],
    },
    select: { senderId: true, receiverId: true, status: true },
  });

  for (const r of rows) {
    const other = r.senderId === viewerId ? r.receiverId : r.senderId;
    if (r.status === 'ACCEPTED') map.set(other, 'connected');
    else if (r.status === 'PENDING') map.set(other, r.senderId === viewerId ? 'pending_out' : 'pending_in');
    // REJECTED → leave as 'none' (default)
  }
  return map;
}

/** Attach a `connectionStatus` field to each user-like row in place. */
export async function attachConnectionStatus<T extends { id: string }>(
  viewerId: string,
  rows: T[],
): Promise<Array<T & { connectionStatus: ConnState }>> {
  const states = await connectionStatesFor(viewerId, rows.map((r) => r.id));
  return rows.map((r) => Object.assign(r, { connectionStatus: states.get(r.id) ?? ('none' as ConnState) }));
}

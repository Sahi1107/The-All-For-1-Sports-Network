import prisma from '../config/db';

/**
 * IDs that should be hidden from the given user in BOTH directions: anyone
 * they blocked, plus anyone who blocked them. Used to filter feed, post
 * detail, comments, Explore, suggestions, etc. so a block is mutual —
 * neither party sees the other's content.
 */
export async function blockedUserIds(userId: string): Promise<string[]> {
  const [mine, theirs] = await Promise.all([
    prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
    prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
  ]);
  return [...new Set([...mine.map((b) => b.blockedId), ...theirs.map((b) => b.blockerId)])];
}

import prisma from '../config/db';
import { blockedUserIds } from './blocks';
import { searchablePeopleWhere, isSearchablePerson } from './search/gate';

// Follower / following LIST access + child-safety filtering, in ONE place so every
// surface (the profile modal, a user's own lists) enforces exactly the same rule.
//
// ACCESS: a follower/following list is openable by the account owner and by its
// ACCEPTED connections only. Non-connections get the counts, never the list.
//
// CONTENT: whoever is allowed to open a list only ever sees entries that pass the
// standard discovery gate (discoverable, NOT guardian-managed, person roles) minus
// anyone in a block relationship with the VIEWER in either direction. Enforced at
// the query level AND re-checked fail-closed after the fetch, so a guardian-managed
// or non-discoverable (minor / private) account is never revealed to anyone —
// including the profile owner — who could not already discover them. This mirrors
// searchablePeopleWhere / isSearchablePerson used across search and explore.

const LIST_SELECT = {
  id: true, name: true, avatar: true, role: true, sport: true, position: true,
  // gate-only fields, needed for the fail-closed re-check, stripped before return:
  discoverable: true, guardianManaged: true,
} as const;

export type SocialListUser = {
  id: string; name: string; avatar: string | null;
  role: string; sport: string | null; position: string | null;
};

/** Owner, or an accepted connection → may open the list. Otherwise counts only. */
export async function canSeeSocialLists(viewerId: string, targetId: string): Promise<boolean> {
  if (viewerId === targetId) return true;
  const conn = await prisma.connection.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { senderId: viewerId, receiverId: targetId },
        { senderId: targetId, receiverId: viewerId },
      ],
    },
    select: { id: true },
  });
  return !!conn;
}

/**
 * Safety-filtered followers OR following of `targetId`, from `viewerId`'s vantage.
 * Applies the discovery gate + the viewer's two-way block list at the query level,
 * then re-checks each row fail-closed and strips the gate-only fields.
 */
export async function socialListUsers(
  direction: 'followers' | 'following',
  targetId: string,
  viewerId: string,
): Promise<SocialListUser[]> {
  const blocked = await blockedUserIds(viewerId);
  const excluded = new Set(blocked);
  const gate = searchablePeopleWhere(blocked); // discoverable + !guardianManaged + person role + id∉blocked

  const rows = direction === 'followers'
    ? await prisma.follow.findMany({
        where: { followingId: targetId, follower: gate },
        select: { follower: { select: LIST_SELECT } },
        orderBy: { createdAt: 'desc' },
      })
    : await prisma.follow.findMany({
        where: { followerId: targetId, following: gate },
        select: { following: { select: LIST_SELECT } },
        orderBy: { createdAt: 'desc' },
      });

  const people = rows.map((r: any) => (direction === 'followers' ? r.follower : r.following));
  return people
    .filter((u: any) => isSearchablePerson(u, excluded)) // fail-closed second pass
    .map((u: any): SocialListUser => ({
      id: u.id, name: u.name, avatar: u.avatar,
      role: u.role, sport: u.sport, position: u.position,
    }));
}

/**
 * A user's accepted connections — the other party in each ACCEPTED edge, either
 * direction — safety-filtered exactly like socialListUsers. Access is gated by
 * canSeeSocialLists at the route, the same as followers/following.
 */
export async function connectionListUsers(targetId: string, viewerId: string): Promise<SocialListUser[]> {
  const blocked = await blockedUserIds(viewerId);
  const excluded = new Set(blocked);
  const rows = await prisma.connection.findMany({
    where: { status: 'ACCEPTED', OR: [{ senderId: targetId }, { receiverId: targetId }] },
    select: {
      senderId: true,
      sender: { select: LIST_SELECT },
      receiver: { select: LIST_SELECT },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const others = rows.map((r: any) => (r.senderId === targetId ? r.receiver : r.sender));
  return others
    .filter((u: any) => isSearchablePerson(u, excluded)) // fail-closed discovery + block gate
    .map((u: any): SocialListUser => ({
      id: u.id, name: u.name, avatar: u.avatar,
      role: u.role, sport: u.sport, position: u.position,
    }));
}

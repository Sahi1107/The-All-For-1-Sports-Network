import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Every query key whose data carries a follower / following / connection count or
// a follow/connect relationship state.
//
// Follow (one-directional) and Connect (mutual) are separate systems, but a single
// action — follow, unfollow, connect, accept, decline, disconnect, block — can move
// numbers on several surfaces at once: YOUR own profile, the other person's profile,
// Explore cards, the mutual-connection/mutual-follower lines, the connections list,
// and the suggestion rails. Rather than reason per-surface about which number moved
// (the bug we're fixing was exactly that reasoning going wrong or being skipped),
// every social mutation refreshes all of them. Matching is by key PREFIX, so
// ['profile'] covers both your own profile and any profile you're viewing.
const SOCIAL_KEYS = [
  'profile',
  'ex-people',
  'mutual-connections',
  'follow-list',
  'connections-list',
  'connections-outgoing',
  'connection-requests',
  'suggestions',
  'rail-suggestions',
] as const;

/**
 * Returns a stable callback that refreshes every follower/following/connection
 * count and relationship-state query across the app. Call it from the onSuccess of
 * any follow/unfollow/connect/accept/decline/disconnect/block mutation so counts
 * update immediately on every surface instead of going stale until reload.
 */
export function useInvalidateSocialCounts(): () => void {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of SOCIAL_KEYS) void qc.invalidateQueries({ queryKey: [key] });
  }, [qc]);
}

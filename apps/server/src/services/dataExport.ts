import prisma from '../config/db';

// DPDP "download my data": assemble a portable JSON snapshot of everything the
// user owns. We include the user's own records only (their posts, their sent
// messages, their connection rows, etc.) — never another user's profile data.

/** Scalar fields that must never leave the server (auth handle / secret hashes). */
const REDACT_KEYS = new Set(['firebaseUid', 'handoverTokenHash', 'guardianConsentTokenHash']);

function redactProfile<T extends Record<string, unknown>>(user: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(user)) {
    if (!REDACT_KEYS.has(k)) out[k] = v;
  }
  return out as Partial<T>;
}

export async function buildUserExport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      posts: true,
      postComments: true,
      postReposts: true,
      highlights: true,
      sentConnections: true,
      receivedConnections: true,
      following: true,
      followers: true,
      endorsementsGiven: true,
      endorsementsReceived: true,
      teamMemberships: true,
      createdTournaments: true,
      playerRankings: true,
      notifications: true,
      sentMessages: true,
      blocksMade: true,
      reportsFiled: true,
    },
  });
  if (!user) throw new Error('User not found');

  const {
    posts, postComments, postReposts, highlights,
    sentConnections, receivedConnections, following, followers,
    endorsementsGiven, endorsementsReceived, teamMemberships, createdTournaments,
    playerRankings, notifications, sentMessages, blocksMade, reportsFiled,
    ...profile
  } = user;

  return {
    format: 'af1-data-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: redactProfile(profile),
    content: { posts, comments: postComments, reposts: postReposts, highlights },
    social: {
      following, followers,
      connections: { sent: sentConnections, received: receivedConnections },
      endorsements: { given: endorsementsGiven, received: endorsementsReceived },
    },
    teams: teamMemberships,
    tournaments: { created: createdTournaments },
    rankings: playerRankings,
    notifications,
    messages: { sent: sentMessages },
    moderation: { blocksMade, reportsFiled },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Who may message whom. The platform's value is scouts reaching athletes, so an
// approved connection is NOT required for a first contact — but with hard limits:
//
//   • Outreach roles (SCOUT/COACH/AGENT/MEDIA) may send ONE first message to a
//     DISCOVERABLE, ADULT athlete who hasn't restricted DMs to followers.
//   • Under-13 and guardian-managed accounts are NEVER reachable by a non-connection
//     — no exceptions. Unknown age is treated as a minor (fail closed).
//   • After the first cold message the sender must WAIT for a reply before sending
//     another (anti-spam). Admins and accepted connections are exempt from all of it.
// ─────────────────────────────────────────────────────────────────────────────

const OUTREACH_ROLES = new Set(['SCOUT', 'COACH', 'AGENT', 'MEDIA']);
const ADULT_AGE = 18;

export interface ContactTarget {
  role: string;
  discoverable: boolean;
  guardianManaged: boolean;
  age: number | null;
  messagingFollowersOnly: boolean;
}

export type ContactDecision = { ok: true } | { ok: false; reason: string };

/** May `senderRole` START a conversation with `target`? */
export function canInitiateContact(input: {
  senderRole: string;
  eitherIsAdmin: boolean;
  hasAcceptedConnection: boolean;
  target: ContactTarget;
}): ContactDecision {
  if (input.eitherIsAdmin) return { ok: true };
  if (input.hasAcceptedConnection) return { ok: true };

  const t = input.target;
  // ── HARD safeguarding line — checked first, never bypassable ──
  if (t.guardianManaged) return { ok: false, reason: 'protected_minor' };
  if (t.age == null || t.age < ADULT_AGE) return { ok: false, reason: 'protected_minor' };
  // ── The target's own choices ──
  if (!t.discoverable) return { ok: false, reason: 'not_discoverable' };
  if (t.messagingFollowersOnly) return { ok: false, reason: 'followers_only' };
  if (t.role !== 'ATHLETE') return { ok: false, reason: 'target_not_athlete' };
  // ── Only outreach roles get cold contact ──
  if (!OUTREACH_ROLES.has(input.senderRole)) return { ok: false, reason: 'sender_not_outreach' };
  return { ok: true };
}

/** May the sender send THIS message in an existing conversation? Enforces the
 *  one-cold-message-until-reply rule; connections/admins are unrestricted. */
export function canSendMessage(input: {
  eitherIsAdmin: boolean;
  hasAcceptedConnection: boolean;
  /** Did this sender open the conversation (sent its first message)? */
  senderIsInitiator: boolean;
  /** Has the OTHER party sent at least one message? */
  targetHasReplied: boolean;
  /** How many messages the sender has already sent in this conversation. */
  senderMessageCount: number;
}): ContactDecision {
  if (input.eitherIsAdmin || input.hasAcceptedConnection) return { ok: true };
  if (!input.senderIsInitiator) return { ok: true }; // the recipient replying is always allowed
  if (input.targetHasReplied) return { ok: true };
  if (input.senderMessageCount >= 1) return { ok: false, reason: 'awaiting_reply' };
  return { ok: true };
}

/** User-facing message for a denied contact/message decision. */
export function contactDenialMessage(reason: string): string {
  switch (reason) {
    case 'protected_minor':   return 'This account is protected and can only be messaged after connecting.';
    case 'followers_only':    return 'This person only accepts messages from people they follow. Send a connection request instead.';
    case 'not_discoverable':  return 'This person isn’t open to new messages. Send a connection request instead.';
    case 'awaiting_reply':    return 'You’ve sent your first message — please wait for a reply before sending more.';
    case 'sender_not_outreach':
    case 'target_not_athlete':
    default:                  return 'You can only message your connections. Send a connection request instead.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email-change reconciliation.
//
// A normal user changes their email with Firebase's verifyBeforeUpdateEmail:
// Firebase sends a link to the NEW address and only switches the account's email
// once they click it. So there's a window where the Firebase token's email is
// still the old one (or, after the click, the new one) while our DB row hasn't
// caught up. We reconcile on the next authenticated /auth/me: if the token's
// email is VERIFIED and differs from the DB email, Firebase is the source of
// truth for identity, so the DB follows.
//
// Pure + exported so the decision is unit-tested without a DB or Firebase.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export interface EmailReconcileInput {
  tokenEmail: string | null | undefined; // email claim on the verified Firebase token
  emailVerified: boolean;                 // email_verified claim
  dbEmail: string | null;                 // our stored email (null on a just-claimed shell profile)
}

/**
 * Decide whether the DB email should be updated to match the identity provider.
 * Only a VERIFIED token email that differs from the stored one triggers an
 * update — an unverified or matching email never does (fail safe: we never
 * adopt an unverified address).
 */
export function reconcileEmail(input: EmailReconcileInput): { update: false } | { update: true; email: string } {
  const token = norm(input.tokenEmail);
  if (!token) return { update: false };
  if (!input.emailVerified) return { update: false };     // never trust an unverified email
  if (token === norm(input.dbEmail)) return { update: false }; // already in sync
  return { update: true, email: token };
}

/** Whether `next` is a valid target to change TO, given the current email. */
export function validateNewEmail(next: string, currentEmail: string): { ok: true; email: string } | { ok: false; error: string } {
  const email = norm(next);
  // Deliberately permissive but structurally sound — the real uniqueness/format
  // authority is Firebase + the DB unique constraint; this catches the obvious.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address' };
  if (email === norm(currentEmail)) return { ok: false, error: "That's already your email" };
  return { ok: true, email };
}

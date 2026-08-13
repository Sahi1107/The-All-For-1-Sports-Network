/**
 * Federated (Google) sign-in decision logic — pure, dependency-free so it can be
 * unit-tested without loading firebase-admin/prisma. The security-sensitive case
 * is `conflict`: it stops a Google account from silently claiming an email that
 * already belongs to a different Firebase UID (that must go through client-side
 * linkWithCredential, which keeps a single UID → a single Prisma user).
 *
 *   • existing         → a user already owns this Firebase UID; sign them in.
 *   • adopt_orphan     → the email exists but isn't linked to any (or this) UID;
 *                        attach the UID (account linking).
 *   • conflict         → the email is already tied to a *different* live UID.
 *   • needs_onboarding → brand-new user; collect role/DOB before creating anything.
 */
export type ProviderOutcome = 'existing' | 'adopt_orphan' | 'conflict' | 'needs_onboarding';

export function decideProviderOutcome(opts: {
  existsByUid: boolean;
  orphanExists: boolean;
  orphanFirebaseUid: string | null | undefined;
  incomingUid: string;
}): ProviderOutcome {
  if (opts.existsByUid) return 'existing';
  if (opts.orphanExists) {
    if (opts.orphanFirebaseUid && opts.orphanFirebaseUid !== opts.incomingUid) return 'conflict';
    return 'adopt_orphan';
  }
  return 'needs_onboarding';
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// ── Live regression guard tied to the Firebase project's sign-in settings ──────
//
// Same-email account linking (services/providerSignin + accountLink) is designed
// for a project with Improved Email Privacy (email-enumeration protection) ON and
// one-account-per-email. That live setting — not the code — is what determines the
// runtime behaviour, and it's exactly what silently changed under us last time
// (the client's account-exists linking flow became dead code). This test reads the
// ACTUAL project config and fails if either assumption drifts.
//
// It needs a gcloud token with access to af-1-a1c26; without one (most CI) it skips
// rather than failing, so it only ever asserts against a real, reachable config.

const PROJECT = 'af-1-a1c26';

function gcloudToken(): string | null {
  try {
    return execFileSync('gcloud', ['auth', 'print-access-token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

async function fetchConfig(token: string): Promise<any | null> {
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`, {
      headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

test('LIVE GUARD: Firebase project keeps the settings the linking design assumes', async (t) => {
  const token = gcloudToken();
  if (!token) { t.skip('no gcloud token available (expected in CI) — cannot read live config'); return; }
  const cfg = await fetchConfig(token);
  if (!cfg) { t.skip('could not reach the Identity Platform config (offline / no access)'); return; }

  // Enumeration protection ON: the client never throws account-exists-with-different-
  // credential, so linking MUST be resolved server-side (decideProviderOutcome →
  // link_auto / link_needs_password). If this flips off, revisit the client flow.
  assert.equal(
    cfg.emailPrivacyConfig?.enableImprovedEmailPrivacy, true,
    'Improved Email Privacy was turned OFF — the server-driven same-email linking design assumes it is ON; revisit AuthContext before changing this.',
  );

  // One account per email: prevents a second Firebase UID for the same email, one of
  // the layers guaranteeing "never a duplicate account for the same email".
  assert.notEqual(
    cfg.signIn?.allowDuplicateEmails, true,
    'allowDuplicateEmails was turned ON — this breaks the single-account-per-email guarantee the linking design relies on.',
  );
});

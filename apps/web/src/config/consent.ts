// Analytics consent (DPDP). Non-essential analytics only run after the user
// explicitly accepts. Auth/session storage is essential and not gated here.

const KEY = 'af1_analytics_consent';

export type Consent = 'granted' | 'denied';

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(v: Consent): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable (private mode / in-app webview) — treat as no consent */
  }
}

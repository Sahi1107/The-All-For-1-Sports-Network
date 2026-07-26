import posthog from 'posthog-js';
import { getConsent } from './consent';

// Product analytics (PostHog). Two gates before anything is captured:
//   1. VITE_POSTHOG_KEY must be set (otherwise a no-op — dev is unaffected).
//   2. The user must have granted analytics consent (DPDP).
// Privacy posture: no autocapture (explicit events only), no session recording,
// person profiles only for identified users, and DNT is respected.

const KEY  = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com';

export const analyticsAvailable = !!KEY;
let started = false;

/** Initialise PostHog if configured AND consent is granted. Safe to call often. */
export function startAnalytics(): void {
  if (started || !analyticsAvailable || getConsent() !== 'granted') return;
  try {
    posthog.init(KEY!, {
      api_host: HOST,
      person_profiles: 'identified_only',
      autocapture: false,            // explicit key events only
      capture_pageview: false,       // we send $pageview manually (path only, no query)
      disable_session_recording: true,
      respect_dnt: true,
      persistence: 'localStorage+cookie',
    });
    started = true;
  } catch {
    /* analytics must never break the app */
  }
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!started) return;
  try { posthog.capture(event, props); } catch { /* noop */ }
}

/** Path-only pageview — never pass query strings (they can carry tokens). */
export function trackPageview(path: string): void {
  if (!started) return;
  try { posthog.capture('$pageview', { path }); } catch { /* noop */ }
}

export function identifyUser(id: string, props?: Record<string, unknown>): void {
  if (!started) return;
  try { posthog.identify(id, props); } catch { /* noop */ }
}

/** Clear the identified user + queued state (call on logout). */
export function resetAnalytics(): void {
  if (!started) return;
  try { posthog.reset(); } catch { /* noop */ }
}

/** Consent withdrawn — stop capturing and clear any local identity. */
export function stopAnalytics(): void {
  if (!started) return;
  try { posthog.opt_out_capturing(); posthog.reset(); } catch { /* noop */ }
  started = false;
}

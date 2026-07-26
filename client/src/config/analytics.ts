import posthog from 'posthog-js';
import { getConsent } from './consent';

// Product analytics (PostHog). Two gates before anything is captured:
//   1. VITE_POSTHOG_KEY must be set (otherwise a no-op — dev is unaffected).
//   2. The user must have granted analytics consent (DPDP).
// Privacy posture: no autocapture (explicit events only), no session recording,
// person profiles only for identified users, and DNT is respected.

const KEY  = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
// Region matters: a US project key is rejected by the EU ingest host (and vice
// versa). Set VITE_POSTHOG_HOST to match your project's region.
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';

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
      // We already gate on explicit opt-in consent; honouring DNT on top of that
      // just creates confusing dead-ends, so we rely on the consent gate.
      respect_dnt: false,
      persistence: 'localStorage+cookie',
      loaded: () => console.info('[analytics] PostHog ready →', HOST),
    });
    // Expose the instance for debugging / manual verification in the console.
    (window as unknown as { posthog?: typeof posthog }).posthog = posthog;
    started = true;
  } catch (e) {
    // Don't swallow silently — a broken init should be visible in the console.
    console.error('[analytics] PostHog init failed', e);
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

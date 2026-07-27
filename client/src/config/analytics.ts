import { getConsent } from './consent';

// Product analytics (PostHog). Two gates before anything is captured:
//   1. VITE_POSTHOG_KEY must be set (otherwise a no-op — dev is unaffected).
//   2. The user must have granted analytics consent (DPDP).
// The SDK is loaded LAZILY (dynamic import) so ~15KB gzip of posthog-js never
// ships in the main bundle — it only downloads once analytics actually starts,
// well after first paint.

const KEY  = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
// Region matters: a US project key is rejected by the EU ingest host (and vice
// versa). Set VITE_POSTHOG_HOST to match your project's region.
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';

export const analyticsAvailable = !!KEY;

type PostHog = typeof import('posthog-js')['default'];
let ph: PostHog | null = null;
let started = false;

/** Initialise PostHog if configured AND consent is granted. Safe to call often. */
export async function startAnalytics(): Promise<void> {
  if (started || ph || !analyticsAvailable || getConsent() !== 'granted') return;
  try {
    const mod = await import('posthog-js'); // lazy — keeps posthog-js out of the main bundle
    ph = mod.default;
    ph.init(KEY!, {
      api_host: HOST,
      person_profiles: 'identified_only',
      autocapture: false,            // explicit key events only
      capture_pageview: false,       // we send $pageview manually (path only, no query)
      disable_session_recording: true,
      respect_dnt: false,
      persistence: 'localStorage+cookie',
      loaded: () => console.info('[analytics] PostHog ready →', HOST),
    });
    (window as unknown as { posthog?: PostHog }).posthog = ph;
    started = true;
  } catch (e) {
    console.error('[analytics] PostHog init failed', e);
  }
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!started || !ph) return;
  try { ph.capture(event, props); } catch { /* noop */ }
}

/** Path-only pageview — never pass query strings (they can carry tokens). */
export function trackPageview(path: string): void {
  if (!started || !ph) return;
  try { ph.capture('$pageview', { path }); } catch { /* noop */ }
}

export function identifyUser(id: string, props?: Record<string, unknown>): void {
  if (!started || !ph) return;
  try { ph.identify(id, props); } catch { /* noop */ }
}

/** Clear the identified user + queued state (call on logout). */
export function resetAnalytics(): void {
  if (!started || !ph) return;
  try { ph.reset(); } catch { /* noop */ }
}

/** Consent withdrawn — stop capturing and clear any local identity. */
export function stopAnalytics(): void {
  if (!started || !ph) return;
  try { ph.opt_out_capturing(); ph.reset(); } catch { /* noop */ }
  started = false;
}

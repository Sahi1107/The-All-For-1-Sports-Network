// Client error monitoring (Sentry). Disabled (a no-op) unless VITE_SENTRY_DSN
// is set. The SDK (~45KB gzip) is loaded LAZILY so it never ships in the main
// bundle and never competes with first paint. Errors and the user tag raised
// before it finishes loading are buffered and flushed on init, so nothing is
// lost during that short window.

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
export const sentryEnabled = !!dsn;

type SentryMod = typeof import('@sentry/react');
let S: SentryMod | null = null;
let loading = false;

const bufferedErrors: Array<{ err: unknown; context?: Record<string, unknown> }> = [];
let bufferedUser: { id: string; role?: string } | null | undefined;

/** Load + initialise Sentry off the critical path (call at idle from main.tsx). */
export async function initSentry(): Promise<void> {
  if (!sentryEnabled || S || loading) return;
  loading = true;
  try {
    const mod = await import('@sentry/react');
    mod.init({
      dsn,
      environment: import.meta.env.PROD ? 'production' : 'development',
      integrations: [mod.browserTracingIntegration()],
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      sendDefaultPii: false,
    });
    S = mod;
    // Flush anything captured before the SDK finished loading.
    if (bufferedUser !== undefined) { try { mod.setUser(bufferedUser ? { id: bufferedUser.id, role: bufferedUser.role } : null); } catch { /* noop */ } bufferedUser = undefined; }
    for (const e of bufferedErrors.splice(0)) {
      try { mod.captureException(e.err, e.context ? { extra: e.context } : undefined); } catch { /* noop */ }
    }
  } catch {
    /* monitoring must never break the app */
  }
}

/** Report an exception (no-op when disabled). Never throws. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;
  if (!S) { if (bufferedErrors.length < 20) bufferedErrors.push({ err, context }); return; }
  try { S.captureException(err, context ? { extra: context } : undefined); } catch { /* noop */ }
}

/** Tag the current user on error reports (call after login; pass null on logout). */
export function setSentryUser(user: { id: string; role?: string } | null): void {
  if (!sentryEnabled) return;
  if (!S) { bufferedUser = user; return; }
  try { S.setUser(user ? { id: user.id, role: user.role } : null); } catch { /* noop */ }
}

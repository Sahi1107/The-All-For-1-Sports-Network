import * as Sentry from '@sentry/react';

// Client error monitoring. Disabled (a no-op) unless VITE_SENTRY_DSN is set, so
// dev and any build without the DSN behaves exactly as before.

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
export const sentryEnabled = !!dsn;

/** Initialise Sentry once, as early as possible (called from main.tsx). */
export function initSentry(): void {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    integrations: [Sentry.browserTracingIntegration()],
    // Sampled performance tracing; error capture is always 100%.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // We don't send analytics-grade PII through Sentry.
    sendDefaultPii: false,
  });
}

/** Report an exception (no-op when disabled). Never throws. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* monitoring must never break the app */
  }
}

/** Tag the current user on error reports (call after login; pass null on logout). */
export function setSentryUser(user: { id: string; role?: string } | null): void {
  if (!sentryEnabled) return;
  try {
    Sentry.setUser(user ? { id: user.id, role: user.role } : null);
  } catch {
    /* noop */
  }
}

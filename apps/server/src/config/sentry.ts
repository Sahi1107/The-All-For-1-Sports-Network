import * as Sentry from '@sentry/node';
import { env } from './env';
import logger from '../utils/logger';

// Error monitoring. Disabled (a no-op) unless SENTRY_DSN is set, so local/dev and
// any deploy without the secret behaves exactly as before. This module is imported
// FIRST in index.ts so init runs before the app + its instrumentation load.

export const sentryEnabled = !!env.SENTRY_DSN;

if (sentryEnabled) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Performance tracing is sampled; error capture is always 100%.
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Don't let Sentry swallow PII we already redact in our own logs.
    sendDefaultPii: false,
  });
  logger.info('sentry.enabled', { environment: env.NODE_ENV });
} else {
  logger.info('sentry.disabled', { reason: 'SENTRY_DSN not set' });
}

/** Report an exception to Sentry (no-op when disabled). Never throws. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* monitoring must never break the request path */
  }
}

export { Sentry };

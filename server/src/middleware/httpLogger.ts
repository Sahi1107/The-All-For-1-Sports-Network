import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// Query-param keys whose values must never appear in logs
const REDACT_PARAMS = new Set(['token', 'reset_token', 'code', 'secret', 'password']);

/** Replace sensitive query-parameter values with [REDACTED] */
function sanitizeUrl(raw: string): string {
  try {
    // Work only on the query string portion so we don't mangle the path
    const qIdx = raw.indexOf('?');
    if (qIdx === -1) return raw;

    const base = raw.slice(0, qIdx);
    const query = raw.slice(qIdx + 1);

    const sanitized = query
      .split('&')
      .map((pair) => {
        const [key] = pair.split('=');
        return REDACT_PARAMS.has(key.toLowerCase()) ? `${key}=[REDACTED]` : pair;
      })
      .join('&');

    return `${base}?${sanitized}`;
  } catch {
    return raw;
  }
}

/**
 * Log every HTTP request once the response is finished.
 * Emits 'warn' for 4xx, 'error' for 5xx, 'http' for everything else.
 * Flags slow responses (>3 s) with an additional warning.
 */
export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, ip } = req;
  const url = sanitizeUrl(req.originalUrl || req.url);
  const ua = (req.get('user-agent') ?? '').slice(0, 200);

  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;

    const level =
      status >= 500 ? 'error' :
      status >= 400 ? 'warn'  :
      'http';

    logger.log(level, 'HTTP', { method, url, status, ms, ip, ua });

    if (ms > 3000) {
      logger.warn('Slow response', { method, url, status, ms });
    }
  });

  next();
}

/**
 * Express 4-argument error handler.
 * Logs every unhandled error before returning a generic 500.
 * Stack traces are included in development, omitted in production.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const isProd = process.env.NODE_ENV === 'production';
  logger.error('Unhandled error', {
    message:  err.message,
    stack:    isProd ? undefined : err.stack,
    method:   req.method,
    url:      sanitizeUrl(req.originalUrl || req.url),
    ip:       req.ip,
  });

  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

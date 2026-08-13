import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Helmet: sets security-relevant HTTP response headers.
 *
 * Key headers applied:
 *  - Strict-Transport-Security (HSTS)   — browsers must use HTTPS for 1 year
 *  - X-Content-Type-Options: nosniff   — blocks MIME-type sniffing
 *  - X-Frame-Options: SAMEORIGIN       — prevents clickjacking
 *  - X-XSS-Protection: 0              — disables legacy broken XSS filter
 *  - Referrer-Policy: no-referrer-when-downgrade
 *  - Permissions-Policy                — disables unneeded browser APIs
 */
export const helmetMiddleware = helmet({
  hsts: isProd
    ? {
        maxAge: 31_536_000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      }
    : false, // don't enforce HSTS locally (would break http://localhost)

  // CSP is intentionally disabled — this is a pure JSON API, not a document server.
  // The frontend (Vite / React) has its own CSP managed via meta tags or the
  // static hosting provider.
  contentSecurityPolicy: false,

  // Allow the API responses to be consumed cross-origin (our React frontend)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

/**
 * HTTPS redirect — production only.
 *
 * When the app sits behind a reverse proxy (Nginx, Cloudflare, AWS ALB),
 * the proxy strips TLS and forwards plain HTTP internally.
 * The original protocol is preserved in the X-Forwarded-Proto header.
 *
 * Requires app.set('trust proxy', N) to be configured so Express trusts
 * that header.  N = number of proxy hops between the internet and the app.
 *
 * Responds with 301 (permanent) so browsers and search engines cache the
 * redirect and stop sending HTTP requests entirely.
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  if (isProd && req.headers['x-forwarded-proto'] === 'http') {
    const host = req.headers.host ?? '';
    res.redirect(301, `https://${host}${req.url}`);
    return;
  }
  next();
}

/**
 * Prevent browsers from caching API responses (auth tokens etc.).
 * Safe to apply globally to all /api/* routes.
 */
export function noCache(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

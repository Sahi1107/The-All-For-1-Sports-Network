import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { env } from '../config/env';

// ─── Known attack-tool / headless-scraper UA signatures ──────────────────────
//
// This list targets tools that are never legitimately used by a human operating
// a sports-network app in a browser or mobile client.  Generic automation tools
// (curl, wget, python-requests) are intentionally absent because they are used
// by legitimate developers in development — bot blocking is only enforced in
// production anyway (see blockBots below).

const ATTACK_TOOL_UA: RegExp[] = [
  // Security scanners
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /nuclei/i,
  /zgrab/i,
  /dirbuster/i,
  /gobuster/i,
  /wfuzz/i,
  /hydra/i,
  /medusa/i,
  // Headless browsers used for scraping
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  // Dedicated scraping frameworks
  /scrapy/i,
];

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Block requests from known attack tools and headless scrapers.
 *
 * Only enforced in production — development keeps curl / httpie / Postman
 * working without friction.  Requests with no User-Agent header are also
 * rejected in production; every real browser and mobile SDK sends one.
 */
export function blockBots(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const ua = req.headers['user-agent'] ?? '';

  if (!ua) {
    logger.warn('bot.no_ua', { ip: req.ip, path: req.path, method: req.method });
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (ATTACK_TOOL_UA.some((pattern) => pattern.test(ua))) {
    logger.warn('bot.blocked_ua', {
      ip:   req.ip,
      ua:   ua.slice(0, 120),
      path: req.path,
    });
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}

/**
 * Cap `page` and `limit` query parameters on every API route.
 *
 * Without this an attacker can issue a single request for
 * `?page=99999&limit=10000` and either exhaust the database cursor or map
 * out the entire dataset cheaply.  Legitimate paginated UIs never need
 * more than 100 items at a time or page numbers beyond a few hundred.
 */
export function paginationGuard(req: Request, res: Response, next: NextFunction): void {
  const rawPage  = req.query.page;
  const rawLimit = req.query.limit;

  if (rawPage !== undefined) {
    const page = parseInt(String(rawPage), 10);
    if (isNaN(page) || page < 1 || page > 200) {
      res.status(400).json({ error: 'page must be between 1 and 200.' });
      return;
    }
  }

  if (rawLimit !== undefined) {
    const limit = parseInt(String(rawLimit), 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ error: 'limit must be between 1 and 100.' });
      return;
    }
  }

  next();
}

/**
 * Attach a unique request ID to every inbound request.
 *
 * Echoes back any `X-Request-ID` supplied by the caller (useful for
 * client-side tracing), or generates a UUID if none was provided.
 * The ID is available as `(req as any).requestId` and is also set
 * on the response so it appears in browser dev-tools / logs together.
 */
export function attachRequestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string | undefined) || randomUUID();
  (req as any).requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

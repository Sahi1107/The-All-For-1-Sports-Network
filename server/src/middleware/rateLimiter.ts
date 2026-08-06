import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { AuthRequest } from './auth';
import logger from '../utils/logger';

// ─── Key generators ───────────────────────────────────────────────────────────

/**
 * For authenticated routes: key by userId so each account gets its own quota
 * regardless of shared IPs (mobile NAT, university networks, etc.).
 * Falls back to IP for unauthenticated calls.
 */
function userOrIp(req: Request, _res: Response): string {
  return (req as AuthRequest).user?.userId ?? req.ip ?? 'unknown';
}

function ipOnly(req: Request, _res: Response): string {
  return req.ip ?? 'unknown';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

interface LimiterConfig {
  name:     string;
  windowMs: number;
  max:      number;
  message:  string;
  keyFn?:   (req: Request, res: Response) => string;
}

function make({ name, windowMs, max, message, keyFn }: LimiterConfig) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
    keyGenerator:    keyFn ?? ipOnly,
    handler(req: Request, res: Response) {
      logger.warn(`rate.limit.${name}`, {
        key:    (keyFn ?? ipOnly)(req, res),
        path:   req.path,
        method: req.method,
        ua:     (req.headers['user-agent'] ?? '').slice(0, 120),
      });
      res.status(429).json({ error: message });
    },
  });
}

// ─── Limiters ─────────────────────────────────────────────────────────────────

/**
 * Global safety net applied to every /api route.
 * 300 requests per 15 minutes per IP.
 * Catches runaway scripts before they reach any business logic.
 */
export const globalApiLimiter = make({
  name:     'global',
  windowMs: 15 * 60 * 1000,
  max:      300,
  message:  'Too many requests. Please slow down.',
});

/**
 * Discovery / read-heavy routes — feed, rankings, highlight list, user search.
 * 120 requests per 15 minutes per IP.
 * Prevents systematic scraping of public-facing data collections.
 */
export const browseLimiter = make({
  name:     'browse',
  windowMs: 15 * 60 * 1000,
  max:      120,
  message:  'Too many browse requests. Please slow down.',
});

/**
 * Write mutations — create team, post announcement, register tournament, etc.
 * 60 requests per 15 minutes per authenticated user.
 * Prevents mass resource creation.
 */
export const writeLimiter = make({
  name:     'write',
  windowMs: 15 * 60 * 1000,
  max:      60,
  message:  'Too many write requests. Please slow down.',
  keyFn:    userOrIp,
});

/**
 * File uploads — highlight videos and post media.
 * 10 uploads per hour per authenticated user.
 * Prevents storage exhaustion and bandwidth abuse.
 */
export const uploadLimiter = make({
  name:     'upload',
  windowMs: 60 * 60 * 1000,
  max:      10,
  message:  'Upload limit reached. You can upload up to 10 files per hour.',
  keyFn:    userOrIp,
});

/**
 * Direct messaging — send message to a conversation.
 * 30 messages per minute per authenticated user.
 * Prevents message spam floods.
 */
export const messageLimiter = make({
  name:     'message',
  windowMs: 60 * 1000,
  max:      30,
  message:  'Sending messages too quickly. Please wait a moment.',
  keyFn:    userOrIp,
});

/**
 * Social graph mutations — follow, unfollow, connection requests.
 * 50 actions per hour per authenticated user.
 * Prevents bot-driven mass-following / connection spam.
 */
export const socialLimiter = make({
  name:     'social',
  windowMs: 60 * 60 * 1000,
  max:      50,
  message:  'Too many social actions. Please try again later.',
  keyFn:    userOrIp,
});

/**
 * Compute-heavy / AI-generation endpoints — ranking calculation, future ML routes.
 * 20 requests per hour per authenticated user.
 * Prevents runaway compute costs.
 */
export const aiLimiter = make({
  name:     'ai',
  windowMs: 60 * 60 * 1000,
  max:      20,
  message:  'Compute limit reached. You can trigger up to 20 operations per hour.',
  keyFn:    userOrIp,
});

/**
 * Claim-code redemption (taking over an organiser-created profile).
 * 10 attempts per hour per IP — deliberately the tightest limiter here.
 *
 * A claim code is an 8-character secret drawn from a 31-symbol alphabet (~8.5e11
 * combinations), and redeeming one hands over a profile carrying somebody's real
 * competitive record. At this rate an attacker gets ~88k guesses a year against
 * odds of 8.5e11, so guessing is not a practical attack. Keyed on IP rather than
 * user because a claimant may have no account row yet.
 */
export const claimLimiter = make({
  name:     'claim',
  windowMs: 60 * 60 * 1000,
  max:      10,
  message:  'Too many claim attempts. Please try again later.',
});

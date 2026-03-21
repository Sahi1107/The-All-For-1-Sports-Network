import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { hasDangerousKeys } from '../validation/common';
import logger from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Schemas {
  body?:   ZodSchema;
  query?:  ZodSchema;
  params?: ZodSchema;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatZodError(error: ZodError): string[] {
  return error.issues.map((e) => {
    const field = e.path.length > 0 ? e.path.join('.') : 'value';
    return `${field}: ${e.message}`;
  });
}

/**
 * Normalize a single query-string value: Express 5 types query params as
 * `string | string[] | ParsedQs | ParsedQs[]`.  We always take the first
 * string value so schemas can be written against plain { key: string }.
 */
function normalizeQuery(raw: Request['query']): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v)) out[k] = typeof v[0] === 'string' ? v[0] : undefined;
    // nested ParsedQs objects are silently dropped — not valid for our API
  }
  return out;
}

// ─── Middleware factory ───────────────────────────────────────────────────────

/**
 * Returns Express middleware that validates and sanitizes incoming data.
 *
 * - `body`   — parsed and sanitized; `req.body` is replaced with the safe result
 * - `query`  — validated; normalised values stored on `req.query`
 * - `params` — validated route parameters
 *
 * On any failure the middleware responds with HTTP 400 and a `details` array
 * listing every field error so clients can show per-field messages.
 *
 * Usage:
 *   router.post('/foo', validate({ body: MyBodySchema }), handler);
 */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const allErrors: string[] = [];

    // ── Prototype-pollution guard ────────────────────────────────────────────
    // Reject any payload that contains __proto__, constructor, or prototype keys.
    // JSON.parse is safe in modern Node, but belt-and-suspenders here.
    if (hasDangerousKeys(req.body)) {
      logger.warn('validation.proto_pollution', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      res.status(400).json({ error: 'Invalid request payload' });
      return;
    }

    // ── Body ─────────────────────────────────────────────────────────────────
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        allErrors.push(...formatZodError(result.error));
      } else {
        req.body = result.data; // overwrite with sanitized data
      }
    }

    // ── Query ─────────────────────────────────────────────────────────────────
    if (schemas.query) {
      const normalized = normalizeQuery(req.query);
      const result = schemas.query.safeParse(normalized);
      if (!result.success) {
        allErrors.push(...formatZodError(result.error).map((e) => `query.${e}`));
      } else {
        // Re-assign validated + coerced values back onto req.query so route
        // handlers read the safe version.  Express allows this at runtime.
        Object.assign(req.query, result.data);
      }
    }

    // ── Params ────────────────────────────────────────────────────────────────
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        allErrors.push(...formatZodError(result.error).map((e) => `param.${e}`));
      }
      // We don't replace req.params (Express owns that object).
      // Routes already cast params with `as string` and the UUID check here
      // ensures they are syntactically valid before any DB query is attempted.
    }

    // ── Result ────────────────────────────────────────────────────────────────
    if (allErrors.length > 0) {
      logger.warn('validation.rejected', {
        ip:     req.ip,
        path:   req.path,
        method: req.method,
        errors: allErrors,
      });
      res.status(400).json({ error: 'Validation failed', details: allErrors });
      return;
    }

    next();
  };
}

/** Shorthand for validating a single UUID route param named `id`. */
export function validateId() {
  const { z } = require('zod') as typeof import('zod');
  const { uuidParam } = require('../validation/common') as typeof import('../validation/common');
  return validate({ params: z.object({ id: uuidParam }) });
}

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { writeLimiter } from '../middleware/rateLimiter';
import { searchAthletes } from '../data/radarSearch';
import { parseScoutingQuery } from '../data/radarParse';
import { env } from '../config/env';

const router = Router();

// POST /api/radar
router.post(
  '/',
  authenticate,
  requireRole('SCOUT', 'COACH', 'AGENT', 'ADMIN'),
  writeLimiter,
  async (req: AuthRequest, res: Response) => {
    // Airtight error handling: a user must NEVER see a raw 500 / "internal server
    // error" from Radar. Every path below returns a calm, friendly message, and an
    // empty result is a normal 200 (honest-empty), not an error.
    try {
      if (!env.ANTHROPIC_API_KEY) {
        res.status(503).json({ error: 'Radar is temporarily unavailable — please try again shortly.' });
        return;
      }

      const { query } = req.body;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }
      if (query.trim().length > 500) {
        res.status(400).json({ error: 'Query too long (max 500 characters)' });
        return;
      }

      // Natural language → structured filters (fast model + strict schema; see radarParse).
      // The AI call can fail transiently (overloaded / rate-limited / timeout) — isolate
      // it so an API hiccup becomes a gentle "try again", never a raw 500.
      let filters;
      try {
        filters = await parseScoutingQuery(query.trim());
      } catch (error) {
        console.error('Radar parse (AI) error:', error);
        res.status(503).json({ error: 'Radar is busy right now — please try again in a moment.' });
        return;
      }

      // Model declined to extract filters → the query was unparseable.
      if (!filters) {
        res.status(422).json({ error: "Couldn't understand that search — try describing a sport, position, and location." });
        return;
      }

      // Retrieval engine: structured location + capless career-stat aggregation,
      // nearest-location widening, graceful-empty, and relevance ranking. Sport and
      // minor-safety (discoverable) are enforced in the engine and never relaxed. An
      // empty result (e.g. a sport with no athletes yet) is a normal 200 with an honest
      // emptyReason the client renders — NOT an error.
      const { results, total, widened, relaxed, emptyReason } = await searchAthletes(filters);

      res.json({ results, filters, total, widened, relaxed, emptyReason });
    } catch (error) {
      // Final safety net — any unexpected server/DB error. Log the real cause for
      // debugging; return a calm message. 503 (not 500) so the user never sees a raw
      // internal-server-error, while staying 5xx so monitoring/alerts still fire.
      console.error('Radar error:', error);
      if (!res.headersSent) {
        res.status(503).json({ error: 'Something went wrong — please try again.' });
      }
    }
  },
);

export default router;

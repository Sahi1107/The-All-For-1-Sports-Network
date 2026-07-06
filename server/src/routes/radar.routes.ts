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
  requireRole('SCOUT', 'COACH', 'AGENT'),
  writeLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!env.ANTHROPIC_API_KEY) {
        res.status(503).json({ error: 'Radar is not configured — missing ANTHROPIC_API_KEY' });
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
      const filters = await parseScoutingQuery(query.trim());
      if (!filters) {
        res.status(422).json({ error: 'Could not understand the query — please rephrase' });
        return;
      }

      // Retrieval engine: structured location + capless career-stat aggregation,
      // nearest-location widening, graceful-empty, and relevance ranking. Sport and
      // minor-safety (discoverable) are enforced in the engine and never relaxed.
      const { results, total, widened, relaxed, emptyReason } = await searchAthletes(filters);

      res.json({ results, filters, total, widened, relaxed, emptyReason });
    } catch (error) {
      console.error('Radar error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;

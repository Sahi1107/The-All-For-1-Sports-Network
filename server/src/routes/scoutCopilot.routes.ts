import { Router, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { writeLimiter } from '../middleware/rateLimiter';
import { searchAthletes, type RadarFilters } from '../data/radarSearch';
import { env } from '../config/env';

const router = Router();

const extractFiltersTool: Anthropic.Tool = {
  name: 'search_athletes',
  description:
    'Extract structured search filters from a natural language scouting query about finding athletes or coaches on an Indian sports platform.',
  input_schema: {
    type: 'object',
    properties: {
      sport: {
        type: 'string',
        enum: [
          'BASKETBALL',
          'FOOTBALL',
          'CRICKET',
          'FIELD_HOCKEY',
          'BADMINTON',
          'ATHLETICS',
          'WRESTLING',
          'BOXING',
          'SHOOTING',
          'WEIGHTLIFTING',
          'ARCHERY',
          'TENNIS',
          'TABLE_TENNIS',
          'RUGBY',
          'SWIMMING',
          'VOLLEYBALL',
        ],
        description: 'Sport to filter by',
      },
      role: {
        type: 'string',
        enum: ['ATHLETE', 'COACH', 'SCOUT', 'AGENT'],
        description: 'User role to filter by — default is ATHLETE',
      },
      position: {
        type: 'string',
        description:
          'Playing position to search for (e.g. striker, goalkeeper, point guard, wicketkeeper). Use the canonical position name.',
      },
      minAge: {
        type: 'number',
        description: 'Minimum age (inclusive)',
      },
      maxAge: {
        type: 'number',
        description: 'Maximum age (inclusive). "under 19" means maxAge = 18.',
      },
      state: {
        type: 'string',
        description:
          'Indian state or union territory name (e.g. Maharashtra, Tamil Nadu, Delhi)',
      },
      city: {
        type: 'string',
        description: 'City name to search within',
      },
      minGoals: {
        type: 'number',
        description: 'Minimum total goals scored — football only',
      },
      minAssists: {
        type: 'number',
        description: 'Minimum total assists — football or basketball',
      },
      minPoints: {
        type: 'number',
        description: 'Minimum total points scored — basketball only',
      },
      minRebounds: {
        type: 'number',
        description: 'Minimum total rebounds — basketball only',
      },
      minRuns: {
        type: 'number',
        description: 'Minimum total runs scored — cricket only',
      },
      minWickets: {
        type: 'number',
        description: 'Minimum total wickets taken — cricket only',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1–20, default 10)',
      },
    },
  },
};

// POST /api/scout-copilot
router.post(
  '/',
  authenticate,
  requireRole('SCOUT', 'COACH', 'AGENT'),
  writeLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!env.ANTHROPIC_API_KEY) {
        res.status(503).json({ error: 'Scout Copilot is not configured — missing ANTHROPIC_API_KEY' });
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

      // ── Step 1: Extract structured filters from natural language ──
      const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

      const aiResponse = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        thinking: { type: 'adaptive' },
        tool_choice: { type: 'tool', name: 'search_athletes' },
        tools: [extractFiltersTool],
        system:
          'You are a sports scouting assistant for an Indian sports platform. ' +
          'Extract precise search filters from the scouting query. ' +
          '"Under 19" means maxAge=18. "10+ goals" means minGoals=10. ' +
          'Left-footed is a position hint, not a filter — omit it. ' +
          'Default role to ATHLETE unless the query mentions coaches.',
        messages: [
          {
            role: 'user',
            content: `Scouting query: "${query.trim()}"`,
          },
        ],
      });

      const toolUse = aiResponse.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (!toolUse) {
        res.status(422).json({ error: 'Could not understand the query — please rephrase' });
        return;
      }

      const filters = toolUse.input as RadarFilters;

      // ── Retrieval engine (Step 4) ─────────────────────────────────
      // Structured location (city/state columns) + capless career-stat
      // aggregation. Sport and minor-safety (discoverable) are enforced in
      // buildAthleteWhere and never relaxed. Response shape is unchanged so
      // the live Scout Copilot UI keeps working.
      const { results, total, widened } = await searchAthletes(filters);

      res.json({ results, filters, total, widened });
    } catch (error) {
      console.error('Scout Copilot error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;

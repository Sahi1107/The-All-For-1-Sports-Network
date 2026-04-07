import { Router, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { writeLimiter } from '../middleware/rateLimiter';
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
        enum: ['BASKETBALL', 'FOOTBALL', 'CRICKET'],
        description: 'Sport to filter by',
      },
      role: {
        type: 'string',
        enum: ['ATHLETE', 'COACH', 'SCOUT'],
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
  requireRole('SCOUT', 'COACH', 'ADMIN'),
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

      const filters = toolUse.input as {
        sport?: string;
        role?: string;
        position?: string;
        minAge?: number;
        maxAge?: number;
        state?: string;
        city?: string;
        minGoals?: number;
        minAssists?: number;
        minPoints?: number;
        minRebounds?: number;
        minRuns?: number;
        minWickets?: number;
        limit?: number;
      };

      const limit = Math.min(Math.max(filters.limit || 10, 1), 20);

      // ── Step 2: Build Prisma where clause ─────────────────────────
      const where: any = {
        role: filters.role || 'ATHLETE',
      };

      if (filters.sport) where.sport = filters.sport;

      if (filters.position) {
        where.position = { contains: filters.position, mode: 'insensitive' };
      }

      if (filters.minAge !== undefined || filters.maxAge !== undefined) {
        where.age = {};
        if (filters.minAge !== undefined) where.age.gte = filters.minAge;
        if (filters.maxAge !== undefined) where.age.lte = filters.maxAge;
      }

      // Location: use the most specific filter available, refine in post-filter
      const locationTerm = filters.city || filters.state;
      if (locationTerm) {
        where.location = { contains: locationTerm, mode: 'insensitive' };
      }

      const hasStatFilter =
        filters.minGoals !== undefined ||
        filters.minAssists !== undefined ||
        filters.minPoints !== undefined ||
        filters.minRebounds !== undefined ||
        filters.minRuns !== undefined ||
        filters.minWickets !== undefined;

      // ── Step 3: Query users ───────────────────────────────────────
      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          avatar: true,
          role: true,
          sport: true,
          position: true,
          age: true,
          location: true,
          height: true,
          bio: true,
          achievements: true,
          footballStats: hasStatFilter
            ? { select: { goals: true, assists: true, tackles: true } }
            : false,
          basketballStats: hasStatFilter
            ? { select: { points: true, rebounds: true, assists: true } }
            : false,
          cricketStats: hasStatFilter
            ? { select: { runs: true, wickets: true } }
            : false,
        },
        // Fetch more when we need post-filter by stats or both city+state
        take: hasStatFilter || (filters.city && filters.state) ? 200 : limit,
        orderBy: { createdAt: 'desc' },
      });

      // ── Step 4: Post-filter (location + stats) ────────────────────
      let filtered = users as any[];

      // Narrow location when both city AND state were specified
      if (filters.city && filters.state) {
        const c = filters.city.toLowerCase();
        const s = filters.state.toLowerCase();
        filtered = filtered.filter((u) => {
          const loc = (u.location || '').toLowerCase();
          return loc.includes(c) && loc.includes(s);
        });
      }

      // Stats filtering
      if (hasStatFilter) {
        filtered = filtered.filter((u) => {
          if (filters.minGoals !== undefined) {
            const total = (u.footballStats || []).reduce((n: number, st: any) => n + st.goals, 0);
            if (total < filters.minGoals!) return false;
          }
          if (filters.minAssists !== undefined) {
            const total =
              (u.footballStats || []).reduce((n: number, st: any) => n + st.assists, 0) +
              (u.basketballStats || []).reduce((n: number, st: any) => n + st.assists, 0);
            if (total < filters.minAssists!) return false;
          }
          if (filters.minPoints !== undefined) {
            const total = (u.basketballStats || []).reduce((n: number, st: any) => n + st.points, 0);
            if (total < filters.minPoints!) return false;
          }
          if (filters.minRebounds !== undefined) {
            const total = (u.basketballStats || []).reduce((n: number, st: any) => n + st.rebounds, 0);
            if (total < filters.minRebounds!) return false;
          }
          if (filters.minRuns !== undefined) {
            const total = (u.cricketStats || []).reduce((n: number, st: any) => n + st.runs, 0);
            if (total < filters.minRuns!) return false;
          }
          if (filters.minWickets !== undefined) {
            const total = (u.cricketStats || []).reduce((n: number, st: any) => n + st.wickets, 0);
            if (total < filters.minWickets!) return false;
          }
          return true;
        });
        filtered = filtered.slice(0, limit);
      }

      // ── Step 5: Attach aggregated stats to each result ────────────
      const results = filtered.map((u) => {
        const stats: Record<string, number> = {};

        if (u.footballStats?.length) {
          stats.goals   = u.footballStats.reduce((n: number, s: any) => n + s.goals, 0);
          stats.assists = u.footballStats.reduce((n: number, s: any) => n + s.assists, 0);
        }
        if (u.basketballStats?.length) {
          stats.points   = u.basketballStats.reduce((n: number, s: any) => n + s.points, 0);
          stats.rebounds = u.basketballStats.reduce((n: number, s: any) => n + s.rebounds, 0);
          stats.assists  = (stats.assists || 0) + u.basketballStats.reduce((n: number, s: any) => n + s.assists, 0);
        }
        if (u.cricketStats?.length) {
          stats.runs    = u.cricketStats.reduce((n: number, s: any) => n + s.runs, 0);
          stats.wickets = u.cricketStats.reduce((n: number, s: any) => n + s.wickets, 0);
        }

        const { footballStats, basketballStats, cricketStats, ...user } = u;
        return { ...user, stats: Object.keys(stats).length ? stats : undefined };
      });

      res.json({ results, filters, total: results.length });
    } catch (error) {
      console.error('Scout Copilot error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;

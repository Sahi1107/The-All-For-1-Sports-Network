import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { browseLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { SearchQuery } from '../validation/search';
import { blockedUserIds } from '../services/blocks';
import { searchablePeopleWhere, isSearchablePerson } from '../services/search/gate';
import { rankByRelevance, sanitizeTerm } from '../services/search/rank';
import { signMediaDeepAll } from '../services/storage';

const router = Router();

// Typeahead suggestions across People, Teams, Tournaments. Fires on every
// (debounced) keystroke, so it stays cheap: min 2 chars, ≤5 rows per group,
// minimal columns, three parallel indexed queries. Privacy: the people gate
// (discoverable + !guardianManaged + role) is applied in the WHERE *and*
// re-applied as a defensive filter — a minor/private/blocked profile can never
// appear in another user's suggestions.
const PER_GROUP = 5;
const OVERFETCH = 12; // fetch a few extra, then rank prefix-matches to the top

// GET /api/search?q=<term>
router.get('/', authenticate, browseLimiter, validate({ query: SearchQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.user!.userId;
    const q = (req.query.q as string) ?? '';
    const term = sanitizeTerm(q);

    // Too short to be useful → empty groups (no error; the client shows recents).
    if (term.length < 2) {
      res.json({ query: q, athletes: [], teams: [], tournaments: [] });
      return;
    }

    // Hide the viewer and anyone in a block relationship with them (both ways).
    const blocked = await blockedUserIds(viewerId);
    const excludeIds = [viewerId, ...blocked];
    const excludedSet = new Set(excludeIds);
    const match = { contains: term, mode: 'insensitive' as const };

    const [peopleRows, teamRows, tournamentRows] = await Promise.all([
      prisma.user.findMany({
        where: { ...searchablePeopleWhere(excludeIds), name: match },
        select: {
          id: true, name: true, role: true, sport: true, position: true,
          state: true, avatar: true, verified: true, discoverable: true, guardianManaged: true,
        },
        orderBy: [{ verified: 'desc' }, { name: 'asc' }],
        take: OVERFETCH,
      }),
      prisma.team.findMany({
        where: { name: match },
        select: { id: true, name: true, sport: true, logo: true, tournament: { select: { name: true } } },
        orderBy: { name: 'asc' },
        take: OVERFETCH,
      }),
      prisma.tournament.findMany({
        where: { name: match },
        select: { id: true, name: true, sport: true, city: true, startDate: true, endDate: true, status: true, thumbnailUrl: true },
        orderBy: { startDate: 'desc' },
        take: OVERFETCH,
      }),
    ]);

    // Belt-and-suspenders: independently re-gate every person row before it can
    // leave the server, then rank prefix-matches first and cap each group.
    const athletes = rankByRelevance(
      peopleRows.filter((u) => isSearchablePerson(u, excludedSet)),
      term, (u) => u.name, PER_GROUP,
    ).map(({ discoverable, guardianManaged, ...safe }) => safe); // drop gate-only fields

    const teams = rankByRelevance(teamRows, term, (t) => t.name, PER_GROUP);
    const tournaments = rankByRelevance(tournamentRows, term, (t) => t.name, PER_GROUP);

    // Sign media only for the handful we return (avatar / logo / thumbnailUrl).
    await Promise.all([
      signMediaDeepAll(athletes),
      signMediaDeepAll(teams),
      signMediaDeepAll(tournaments),
    ]);

    res.json({ query: q, athletes, teams, tournaments });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

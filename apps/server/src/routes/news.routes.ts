import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { browseLimiter } from '../middleware/rateLimiter';
import { getNews } from '../services/news';

// GET /api/news — the sports-news items for the feed right-rail module.
// Editorial control lives in services/news.ts (an allow-list of outlets we
// review, refreshed daily); this endpoint just serves it. Authenticated +
// browse-limited like other feed reads.
const router = Router();

router.get('/', authenticate, browseLimiter, async (req: AuthRequest, res: Response) => {
  // The rail leads with the viewer's own sport, so it has to be read off the
  // profile — the auth token carries role, not sport. A failed lookup is not
  // worth failing the rail over: it just falls back to the unpersonalised list.
  const viewer = await prisma.user
    .findUnique({ where: { id: req.user!.userId }, select: { sport: true } })
    .catch(() => null);

  // getNews never rejects — it falls back to the curated list — so there is
  // nothing here that could leave the rail without items.
  res.json({ items: await getNews(5, viewer?.sport) });
});

export default router;

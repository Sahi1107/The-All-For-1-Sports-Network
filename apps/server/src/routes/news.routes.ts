import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { browseLimiter } from '../middleware/rateLimiter';
import { getNews } from '../services/news';

// GET /api/news — the sports-news items for the feed right-rail module.
// Editorial control lives in services/news.ts (an allow-list of outlets we
// review, refreshed daily); this endpoint just serves it. Authenticated +
// browse-limited like other feed reads.
const router = Router();

router.get('/', authenticate, browseLimiter, async (_req: AuthRequest, res: Response) => {
  // getNews never rejects — it falls back to the curated list — so there is
  // nothing here that could leave the rail without items.
  res.json({ items: await getNews() });
});

export default router;

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { browseLimiter } from '../middleware/rateLimiter';
import { getCuratedNews } from '../services/news';

// GET /api/news — the curated sports-news items for the feed right-rail module.
// Editorial control lives in services/news.ts (an allow-list we review); this
// endpoint just serves it. Authenticated + browse-limited like other feed reads.
const router = Router();

router.get('/', authenticate, browseLimiter, (_req: AuthRequest, res: Response) => {
  res.json({ items: getCuratedNews() });
});

export default router;

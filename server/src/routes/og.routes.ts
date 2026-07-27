import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { renderCard } from '../services/og/render';
import { athleteCard, tournamentCard, teamCard, fallbackCard } from '../services/og/cards';
import { athleteCardEligible, stateOnly } from '../services/og/eligibility';
import { browseLimiter } from '../middleware/rateLimiter';

const router = Router();

// OG cards are public artifacts → cache hard at the CDN, softer in the browser.
const CACHE = 'public, max-age=600, s-maxage=86400, stale-while-revalidate=604800';

async function sendCard(res: Response, element: unknown): Promise<void> {
  const buf = await renderCard(element);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', CACHE);
  res.send(buf);
}
async function sendFallback(res: Response): Promise<void> {
  // Ineligible / not-found → brand-only card, never leaks entity data, still cacheable-short.
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Content-Type', 'image/png');
  res.send(await renderCard(fallbackCard()));
}

const initialOf = (name?: string | null) => (name?.trim()?.[0] ?? '·').toUpperCase();
const titleCase = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

function fmtDates(start: Date, end: Date): string {
  const M = { timeZone: 'Asia/Kolkata', month: 'short' as const };
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const d = (x: Date) => x.getUTCDate();
  const mon = new Intl.DateTimeFormat('en-GB', M).format(end);
  const yr = end.getUTCFullYear();
  return sameMonth ? `${d(start)}-${d(end)} ${mon}` : `${d(start)} ${new Intl.DateTimeFormat('en-GB', M).format(start)} - ${d(end)} ${mon} ${yr}`;
}

// ─── GET /api/og/athlete/:id.png ────────────────────────────────────────────
router.get('/athlete/:id.png', browseLimiter, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: (req.params.id as string).replace(/\.png$/, '') },
      select: { name: true, sport: true, position: true, location: true, verified: true, age: true, role: true, discoverable: true, guardianManaged: true },
    });
    // Same eligibility gate as the public SSR pages. Never a public card otherwise.
    if (!athleteCardEligible(user)) { await sendFallback(res); return; }

    // Key career totals (no photo — minor-safety; monogram instead).
    let stats: { value: string; label: string }[] = [];
    try {
      if (user!.sport === 'FOOTBALL') {
        const a = await prisma.footballStats.aggregate({ where: { userId: req.params.id as string }, _count: { _all: true }, _sum: { goals: true, assists: true } });
        if (a._count._all) stats = [{ value: String(a._count._all), label: 'Matches' }, { value: String(a._sum.goals ?? 0), label: 'Goals' }, { value: String(a._sum.assists ?? 0), label: 'Assists' }];
      } else if (user!.sport === 'BASKETBALL') {
        const a = await prisma.basketballStats.aggregate({ where: { userId: req.params.id as string }, _count: { _all: true }, _sum: { points: true, rebounds: true } });
        if (a._count._all) stats = [{ value: String(a._count._all), label: 'Matches' }, { value: String(a._sum.points ?? 0), label: 'Points' }, { value: String(a._sum.rebounds ?? 0), label: 'Rebounds' }];
      }
    } catch { /* stats optional */ }

    await sendCard(res, athleteCard({
      name: user!.name, initial: initialOf(user!.name),
      sport: titleCase(user!.sport), position: user!.position, state: stateOnly(user!.location),
      verified: user!.verified, stats,
    }));
  } catch (e) { console.error('og.athlete', e); await sendFallback(res); }
});

// ─── GET /api/og/tournament/:id.png ─────────────────────────────────────────
router.get('/tournament/:id.png', browseLimiter, async (req: Request, res: Response) => {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: (req.params.id as string).replace(/\.png$/, '') },
      select: { name: true, sport: true, city: true, startDate: true, endDate: true, status: true, _count: { select: { teams: true } } },
    });
    if (!t) { await sendFallback(res); return; }
    const status = t.status === 'COMPLETED' ? 'Completed' : t.status === 'IN_PROGRESS' ? 'Live' : 'Upcoming';
    await sendCard(res, tournamentCard({
      name: t.name, sport: titleCase(t.sport), city: t.city, dates: fmtDates(t.startDate, t.endDate), teamCount: t._count.teams, status,
    }));
  } catch (e) { console.error('og.tournament', e); await sendFallback(res); }
});

// ─── GET /api/og/team/:id.png ───────────────────────────────────────────────
router.get('/team/:id.png', browseLimiter, async (req: Request, res: Response) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: (req.params.id as string).replace(/\.png$/, '') },
      select: { name: true, sport: true, tournament: { select: { name: true } } },
    });
    if (!team) { await sendFallback(res); return; }
    await sendCard(res, teamCard({ name: team.name, initial: initialOf(team.name), sport: titleCase(team.sport), tournament: team.tournament?.name ?? null }));
  } catch (e) { console.error('og.team', e); await sendFallback(res); }
});

export default router;

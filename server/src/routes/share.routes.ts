import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { athleteCardEligible, stateOnly } from '../services/og/eligibility';

const router = Router();
const BASE = 'https://allfor1.pro';

const titleCase = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const slugify = (name: string, id: string) =>
  `${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${id.replace(/-/g, '').slice(0, 12)}`;

interface Meta { title: string; desc: string; target: string; img: string }

async function resolveMeta(type: string, id: string): Promise<Meta> {
  const fallback: Meta = { title: 'All For 1', desc: 'The network for the sports ecosystem.', target: BASE, img: `${BASE}/og-image.png` };

  if (type === 'athlete') {
    const u = await prisma.user.findUnique({
      where: { id }, select: { name: true, sport: true, position: true, location: true, verified: true, role: true, discoverable: true, guardianManaged: true, age: true },
    });
    if (!athleteCardEligible(u)) return fallback; // never leak an ineligible/minor profile's data
    const bits = [titleCase(u!.sport), u!.position, stateOnly(u!.location)].filter(Boolean).join(' · ');
    return {
      title: `${u!.name}${u!.verified ? ' ✓' : ''} · ${titleCase(u!.sport)} | All For 1`,
      desc: `${u!.name} — ${bits}. See their profile, stats and highlights on All For 1.`,
      target: `${BASE}/athletes/${slugify(u!.name, id)}`,
      img: `${BASE}/og/athlete/${id}.png`,
    };
  }

  if (type === 'tournament') {
    const t = await prisma.tournament.findUnique({ where: { id }, select: { name: true, sport: true, city: true } });
    if (!t) return fallback;
    return {
      title: `${t.name} | All For 1`,
      desc: `${t.name} — ${[titleCase(t.sport), t.city].filter(Boolean).join(' · ')}. Follow fixtures, results and standings on All For 1.`,
      target: `${BASE}/tournaments/${id}`,
      img: `${BASE}/og/tournament/${id}.png`,
    };
  }

  if (type === 'team') {
    const team = await prisma.team.findUnique({ where: { id }, select: { name: true, sport: true, tournament: { select: { name: true } } } });
    if (!team) return fallback;
    return {
      title: `${team.name} | All For 1`,
      desc: `${team.name} — ${[titleCase(team.sport), team.tournament?.name].filter(Boolean).join(' · ')} on All For 1.`,
      target: `${BASE}/teams/${id}`,
      img: `${BASE}/og/team/${id}.png`,
    };
  }

  return fallback;
}

// GET /s/:type/:id — crawler-friendly OG page + human redirect to the real page.
router.get('/:type/:id', async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params as { type: string; id: string };
    const m = await resolveMeta(type, id);
    const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.desc)}">
<link rel="canonical" href="${esc(m.target)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="All For 1">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.desc)}">
<meta property="og:url" content="${esc(m.target)}">
<meta property="og:image" content="${esc(m.img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(m.title)}">
<meta name="twitter:description" content="${esc(m.desc)}">
<meta name="twitter:image" content="${esc(m.img)}">
<meta http-equiv="refresh" content="0; url=${esc(m.target)}">
</head><body style="background:#080808;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<a href="${esc(m.target)}" style="color:#dbff5a">Continue to All For 1 →</a>
<script>location.replace(${JSON.stringify(m.target)})</script>
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (e) {
    console.error('share.route', e);
    res.redirect(302, BASE);
  }
});

export default router;

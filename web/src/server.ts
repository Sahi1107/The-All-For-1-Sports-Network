// allfor1-web — public SSR renderer (read-only). Cloud Run.
// Serves athlete profiles, hub pages (/athletes, /athletes/:sport[/:state]) and
// /sitemap-athletes.xml. Every request re-runs the exposure gate at the origin
// (no per-profile caching in-process), so a profile going private drops out of
// profiles, hub listings AND the sitemap on the very next render. The CDN caches
// eligible pages for a short TTL only (see *_CACHE).
import http from 'node:http';
import {
  fetchAthleteRow, fetchAthletesBySport, fetchEligibleForSitemap, fetchSportsWithCounts,
  fetchFeaturedAthletes,
} from './db.js';
import { gateAndSerialize, parseSlugId, kebab, type PublicAthlete } from './publicAthlete.js';
import { renderProfile, renderNotFound } from './render.js';
import { renderSportHub, renderAthletesRoot, renderSitemap, type FeaturedAthlete } from './renderHub.js';
import { renderFaq } from './renderFaq.js';
import { renderAbout, renderSafety, renderCommunityGuidelines } from './renderPages.js';
import { renderLearnIndex, renderLearnArticle } from './renderLearn.js';
import { sportFromSlug, type SportEnum } from './sports.js';

const PORT = Number(process.env.PORT) || 8080;

// Short edge TTL → a privacy/age change propagates to cached copies within ~60s
// (origin is always correct on the next render). Deliberately conservative while
// pages can be minors' profiles; raise when traffic justifies it.
const PROFILE_CACHE = 'public, max-age=60, must-revalidate';
const HUB_CACHE = 'public, max-age=60, must-revalidate'; // hubs list minors-adjacent data → same short TTL
const SITEMAP_CACHE = 'public, max-age=300';             // just a URL list; a stale entry merely 404s
const STATIC_CACHE = 'public, max-age=3600';             // static content pages (FAQ/about/safety/…); safe to cache longer

// Static SSR content pages keyed by path → renderer.
const STATIC_PAGES: Record<string, () => string> = {
  '/faq': renderFaq,
  '/about': renderAbout,
  '/safety': renderSafety,
  '/community-guidelines': renderCommunityGuidelines,
};

// Body is written for GET; omitted for HEAD (headers/status identical).
function send(res: http.ServerResponse, method: string, status: number, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(method === 'HEAD' ? undefined : body);
}

/** Hard 404 — identical for ineligible AND non-existent; never cached, noindex. */
function notFound(res: http.ServerResponse, method: string) {
  send(res, method, 404, renderNotFound(), {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  });
}

/** Transient failure — 503, not 404, so a DB blip never deindexes an eligible athlete. */
function unavailable(res: http.ServerResponse, method: string) {
  send(res, method, 503, '<!doctype html><meta charset="utf-8"><title>Temporarily unavailable</title><h1>Please try again</h1>', {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    'Retry-After': '30',
  });
}

/** GET/HEAD /athletes/<slug> — one profile. */
async function handleProfile(res: http.ServerResponse, method: string, requestedSlug: string, hex: string, now: Date) {
  const row = await fetchAthleteRow(hex, now);   // primary gate (SQL)
  const athlete = gateAndSerialize(row, now);    // independent re-gate + serialize
  if (!athlete) return notFound(res, method);    // ineligible OR missing → identical 404
  if (athlete.slug !== requestedSlug) {
    res.writeHead(301, { Location: `/athletes/${athlete.slug}`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  return send(res, method, 200, renderProfile(athlete), { 'Cache-Control': PROFILE_CACHE });
}

/** GET/HEAD /athletes — index of sports with eligible athletes + a featured preview. */
async function handleRoot(res: http.ServerResponse, method: string, now: Date) {
  const [sports, featuredRows] = await Promise.all([
    fetchSportsWithCounts(now),
    fetchFeaturedAthletes(now, 12),
  ]);
  // Re-gate EVERY featured row independently (same guarantee as a profile), then
  // attach the display-only rank. A row that fails the re-check is dropped.
  const featured = featuredRows
    .map((r) => {
      const pub = gateAndSerialize(r, now);
      return pub ? { ...pub, rank: r.bestRank } : null;
    })
    .filter((a): a is FeaturedAthlete => a !== null);
  const headers: Record<string, string> = { 'Cache-Control': HUB_CACHE };
  if (sports.length === 0) headers['X-Robots-Tag'] = 'noindex';
  return send(res, method, 200, renderAthletesRoot(sports, featured), headers);
}

/** GET/HEAD /athletes/:sport and /athletes/:sport/:state. */
async function handleSportHub(res: http.ServerResponse, method: string, sport: SportEnum, stateParam: string | null, now: Date) {
  const rows = await fetchAthletesBySport(sport, now);
  const all = rows
    .map((r) => gateAndSerialize(r, now)) // re-gate every listed row — same guarantee as a profile
    .filter((a): a is PublicAthlete => a !== null);

  if (stateParam !== null) {
    const inState = all.filter((a) => a.state && kebab(a.state) === stateParam);
    // Free-text states are unbounded — only serve a state hub that actually has
    // eligible athletes; anything else is a hard 404 (no soft pages for junk input).
    if (inState.length === 0) return notFound(res, method);
    const html = renderSportHub(sport, inState[0].state, inState, []);
    return send(res, method, 200, html, { 'Cache-Control': HUB_CACHE });
  }

  // Sport hub: gather state sub-hubs (distinct states among eligible athletes).
  const byState = new Map<string, { label: string; n: number }>();
  for (const a of all) {
    if (!a.state) continue;
    const s = kebab(a.state);
    const cur = byState.get(s) ?? { label: a.state, n: 0 };
    cur.n += 1;
    byState.set(s, cur);
  }
  const subStates = [...byState.entries()]
    .map(([slug, v]) => ({ slug, label: v.label, n: v.n }))
    .sort((x, y) => y.n - x.n || x.label.localeCompare(y.label));

  const headers: Record<string, string> = { 'Cache-Control': HUB_CACHE };
  if (all.length === 0) headers['X-Robots-Tag'] = 'noindex'; // valid sport, empty → 200 but noindex
  return send(res, method, 200, renderSportHub(sport, null, all, subStates), headers);
}

/** GET/HEAD /sitemap-athletes.xml — eligible profiles only. */
async function handleSitemap(res: http.ServerResponse, method: string, now: Date) {
  const rows = await fetchEligibleForSitemap(now);
  const entries: Array<{ slug: string; lastmod: Date | null }> = [];
  for (const r of rows) {
    const a = gateAndSerialize(r, now); // re-gate every URL that goes into the sitemap
    if (a) entries.push({ slug: a.slug, lastmod: r.updatedAt });
  }
  return send(res, method, 200, renderSitemap(entries), {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': SITEMAP_CACHE,
  });
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    if (path === '/_health') return send(res, method, 200, 'ok', { 'Content-Type': 'text/plain' });
    if (method !== 'GET' && method !== 'HEAD') return notFound(res, method);

    const staticPage = STATIC_PAGES[path];
    if (staticPage) return send(res, method, 200, staticPage(), { 'Cache-Control': STATIC_CACHE });

    // /learn hub + articles
    if (path === '/learn') return send(res, method, 200, renderLearnIndex(), { 'Cache-Control': STATIC_CACHE });
    if (path.startsWith('/learn/')) {
      const slug = decodeURIComponent(path.slice('/learn/'.length).replace(/\/+$/, ''));
      const html = renderLearnArticle(slug);
      return html ? send(res, method, 200, html, { 'Cache-Control': STATIC_CACHE }) : notFound(res, method);
    }

    const now = new Date();
    if (path === '/sitemap-athletes.xml') return await handleSitemap(res, method, now);

    const segments = path.replace(/^\/+|\/+$/g, '').split('/');
    if (segments[0] === 'athletes') {
      if (segments.length === 1) return await handleRoot(res, method, now);
      if (segments.length === 2) {
        const seg = decodeURIComponent(segments[1]);
        const hex = parseSlugId(seg);
        if (hex) return await handleProfile(res, method, seg, hex, now); // profile slug
        const sport = sportFromSlug(seg);
        if (sport) return await handleSportHub(res, method, sport, null, now); // sport hub
        return notFound(res, method);
      }
      if (segments.length === 3) {
        const sport = sportFromSlug(decodeURIComponent(segments[1]));
        if (!sport) return notFound(res, method);
        return await handleSportHub(res, method, sport, decodeURIComponent(segments[2]), now); // sport+state
      }
    }
    return notFound(res, method);
  } catch (err) {
    console.error('render error', err);
    return unavailable(res, method); // fail closed: no content leaked, and retryable (not a deindex signal)
  }
});

server.listen(PORT, () => console.log(`allfor1-web listening on ${PORT}`));

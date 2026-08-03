// SSR HTML for the athlete hub pages (/athletes, /athletes/:sport,
// /athletes/:sport/:state) and the XML for /sitemap-athletes.xml.
// Consumes ONLY the safe PublicAthlete shape — same gate/serializer as profiles,
// so no ineligible/minor athlete can appear in a listing, a link, or the sitemap.
import type { PublicAthlete } from './publicAthlete.js';
import { kebab } from './publicAthlete.js';
import { SITE_URL, SITE_NAME, esc, footerHtml } from './render.js';
import { HEAD_STYLES, pageHeader, verifiedTick } from './styles.js';
import { sportSlug, sportLabel } from './sports.js';

export interface Shell {
  title: string;
  desc: string;
  canonical: string;
  indexable: boolean;
  ld: object | object[];
  main: string;
  prose?: boolean; // content pages (FAQ/about/learn) → readable prose column
}

export function htmlShell(s: Shell): string {
  const robots = s.indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow';
  const ldBlocks = (Array.isArray(s.ld) ? s.ld : [s.ld])
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n    ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(s.title)}</title>
    <meta name="description" content="${esc(s.desc)}" />
    <link rel="canonical" href="${esc(s.canonical)}" />
    <meta name="robots" content="${robots}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:url" content="${esc(s.canonical)}" />
    <meta property="og:title" content="${esc(s.title)}" />
    <meta property="og:description" content="${esc(s.desc)}" />
    <meta property="og:image" content="${SITE_URL}/og-image.png" />
    ${HEAD_STYLES}
    ${ldBlocks}
  </head>
  <body>
    ${pageHeader()}
    <main class="af-main${s.prose ? ' af-prose' : ''}">${s.main}</main>
    ${footerHtml()}
  </body>
</html>`;
}

function athleteCard(a: PublicAthlete): string {
  const initial = esc((a.name || '?').charAt(0).toUpperCase());
  const meta = [a.position, a.state].filter(Boolean).map((x) => esc(String(x))).join(' · ');
  return `<a class="af-acard" href="/athletes/${esc(a.slug)}">
        <span class="af-acard__av">${initial}</span>
        <span style="min-width:0;flex:1">
          <span class="af-acard__name">${esc(a.name)}${a.verified ? verifiedTick(15) : ''}</span>
          ${meta ? `<span class="af-acard__meta">${meta}</span>` : ''}
        </span>
        <span class="af-acard__go" aria-hidden="true">›</span>
      </a>`;
}

/** A featured athlete on the root page: sport-led meta + optional public rank. */
export type FeaturedAthlete = PublicAthlete & { rank: number | null };

function featuredCard(a: FeaturedAthlete): string {
  const initial = esc((a.name || '?').charAt(0).toUpperCase());
  const meta = [a.sport ? sportLabel(a.sport) : null, a.position, a.state]
    .filter(Boolean).map((x) => esc(String(x))).join(' · ');
  const rankBadge = a.rank != null
    ? `<span class="af-acard__rank">#${esc(String(a.rank))}</span>`
    : '';
  return `<a class="af-fcard" href="/athletes/${esc(a.slug)}">
        <span class="af-fcard__av">${initial}${rankBadge}</span>
        <span class="af-fcard__body">
          <span class="af-acard__name">${esc(a.name)}${a.verified ? verifiedTick(15) : ''}</span>
          ${meta ? `<span class="af-acard__meta">${meta}</span>` : ''}
        </span>
      </a>`;
}

function itemListLd(athletes: PublicAthlete[]): object {
  return {
    '@type': 'ItemList',
    numberOfItems: athletes.length,
    itemListElement: athletes.map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/athletes/${a.slug}`,
      name: a.name,
    })),
  };
}

function breadcrumbLd(trail: Array<{ name: string; item: string }>): object {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, item: t.item,
    })),
  };
}

/** /athletes — index of sports, PLUS a preview of real (eligible) athletes so
 *  the page reads as a live directory rather than three chips and a button. */
export function renderAthletesRoot(
  sports: Array<{ sport: string; n: number }>,
  featured: FeaturedAthlete[] = [],
): string {
  const canonical = `${SITE_URL}/athletes`;
  const title = `Athletes | ${SITE_NAME}`;
  const desc = `Discover athletes on All For 1 by sport — verified profiles, positions, teams, and achievements.`;
  const total = sports.reduce((sum, s) => sum + s.n, 0);
  const links = sports
    .map((s) => `<a class="af-chip" href="/athletes/${sportSlug(s.sport)}">${esc(sportLabel(s.sport))} <span class="af-chip__n">${s.n}</span></a>`)
    .join('');
  const main = `
      <nav aria-label="Breadcrumb"><a href="/">All For 1</a> › Athletes</nav>
      <h1 class="af-ptitle">Athletes</h1>
      <p class="af-lead">Discover verified athletes on All For 1 by sport — profiles, positions, teams, and achievements.</p>
      ${sports.length ? `<div class="af-chips">${links}</div>` : `<p class="af-note">No public athletes yet.</p>`}
      ${featured.length ? `
      <section class="af-section">
        <div class="af-section__head">
          <h2 class="af-h2">Featured athletes</h2>
          ${total > featured.length ? `<span class="af-section__count">${total} on All For 1</span>` : ''}
        </div>
        <div class="af-fgrid">${featured.map(featuredCard).join('')}</div>
      </section>` : ''}
      <p class="af-joinrow"><a class="af-btn af-btn--primary af-btn--lg" href="${SITE_URL}/register">Join All For 1</a></p>`;
  return htmlShell({
    title, desc, canonical, indexable: sports.length > 0,
    ld: [
      {
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: canonical,
        breadcrumb: breadcrumbLd([{ name: 'All For 1', item: `${SITE_URL}/` }, { name: 'Athletes', item: canonical }]),
      },
      ...(featured.length ? [itemListLd(featured)] : []),
    ],
    main,
  });
}

/**
 * /athletes/:sport and /athletes/:sport/:state. `stateDisplay` is the human state
 * (e.g. "Goa") when on a state sub-hub, else null. `subStates` are state links to
 * show on a sport hub (empty on a state hub).
 */
export function renderSportHub(
  sport: string,
  stateDisplay: string | null,
  athletes: PublicAthlete[],
  subStates: Array<{ slug: string; label: string; n: number }>,
): string {
  const label = sportLabel(sport);
  const slug = sportSlug(sport);
  const canonical = stateDisplay
    ? `${SITE_URL}/athletes/${slug}/${kebab(stateDisplay)}`
    : `${SITE_URL}/athletes/${slug}`;
  const where = stateDisplay ? ` in ${stateDisplay}` : '';
  const title = `${label} athletes${where} | ${SITE_NAME}`;
  const desc = athletes.length
    ? `${athletes.length} ${label} athlete${athletes.length === 1 ? '' : 's'}${where} on All For 1 — profiles, positions, teams, and achievements.`
    : `${label} athletes${where} on All For 1.`;

  const trail = [
    { name: 'All For 1', item: `${SITE_URL}/` },
    { name: 'Athletes', item: `${SITE_URL}/athletes` },
    { name: label, item: `${SITE_URL}/athletes/${slug}` },
  ];
  if (stateDisplay) trail.push({ name: stateDisplay, item: canonical });

  const stateLinks = subStates.length
    ? `<div class="af-section"><h2 class="af-h2">By state</h2><div class="af-chips">${subStates
        .map((s) => `<a class="af-chip" href="/athletes/${slug}/${esc(s.slug)}">${esc(s.label)} · ${s.n}</a>`)
        .join('')}</div></div>`
    : '';

  const list = athletes.length
    ? `<div class="af-grid">${athletes.map(athleteCard).join('')}</div>`
    : `<p class="af-note">No public ${esc(label)} athletes${where ? esc(where) : ''} yet.</p>`;

  const lead = athletes.length
    ? `<p class="af-lead">${athletes.length} verified ${esc(label.toLowerCase())} athlete${athletes.length === 1 ? '' : 's'}${where ? esc(where) : ''} on All For 1.</p>`
    : '';

  const main = `
      <nav aria-label="Breadcrumb"><a href="/">All For 1</a> › <a href="/athletes">Athletes</a> › <a href="/athletes/${slug}">${esc(label)}</a>${stateDisplay ? ` › ${esc(stateDisplay)}` : ''}</nav>
      <h1 class="af-ptitle">${esc(label)} athletes${where ? esc(where) : ''}</h1>
      ${lead}
      ${list}
      ${stateLinks}
      <p class="af-joinrow"><a class="af-btn af-btn--primary af-btn--lg" href="${SITE_URL}/register">Join All For 1</a></p>`;

  return htmlShell({
    title, desc, canonical, indexable: athletes.length > 0,
    ld: {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: canonical,
      mainEntity: itemListLd(athletes),
      breadcrumb: breadcrumbLd(trail),
    },
    main,
  });
}

/** /sitemap-athletes.xml — one <url> per eligible athlete profile. */
export function renderSitemap(entries: Array<{ slug: string; lastmod: Date | null }>): string {
  const urls = entries
    .map((e) => {
      const loc = esc(`${SITE_URL}/athletes/${e.slug}`);
      const lastmod = e.lastmod ? `<lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>` : '';
      return `  <url><loc>${loc}</loc>${lastmod}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

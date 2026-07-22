// ── Phase 1a SEO config — build-time only (never bundled into the SPA) ──
// Per-page metadata, semantic content, and JSON-LD for the public marketing pages.
// Legal page content is imported from the SAME modules the SPA renders, so the
// crawlable HTML and the app can't drift.
import type { Block, Section } from '../src/pages/legal/LegalDoc';
import { TERMS_DOC } from '../src/content/terms';
import { PRIVACY_DOC } from '../src/content/privacy';

export const SITE = {
  url: 'https://allfor1.pro',
  name: 'All For 1',
  legalName: 'The AllFor1 Network',
  description:
    'All For 1 is India’s sports network where athletes build a profile, showcase highlights, ' +
    'join tournaments, climb the rankings, and get discovered by scouts, coaches, and academies.',
  ogImage: 'https://allfor1.pro/og-image.png',
  logo: 'https://allfor1.pro/logo-square-navy.png',
  contactEmail: 'info@allfor1.pro',
  sameAs: [
    'https://www.instagram.com/allfor1.sport/',
  ],
};

/** Escape text for safe inclusion in HTML. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Legal document → semantic HTML (mirrors LegalDoc's block kinds) ──
function renderBlock(b: Block): string {
  switch (b.kind) {
    case 'h3':
      return `<h3>${esc(b.text)}</h3>`;
    case 'p':
      return `<p>${esc(b.text)}</p>`;
    case 'callout':
      return `<blockquote>${esc(b.text)}</blockquote>`;
    case 'caps':
      return `<p>${esc(b.text)}</p>`;
    case 'ul':
      return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'kv':
      return `<dl>${b.rows
        .map((r) => `<dt>${esc(r.label)}</dt><dd>${r.href ? `<a href="${esc(r.href)}">${esc(r.value)}</a>` : esc(r.value)}</dd>`)
        .join('')}</dl>`;
    default:
      return '';
  }
}

function renderLegalDoc(doc: { title: string; effectiveDate: string; intro: Block[]; sections: Section[] }): string {
  const intro = doc.intro.map(renderBlock).join('');
  const sections = doc.sections
    .map((s) => `<section><h2>${esc(s.num)}. ${esc(s.title)}</h2>${s.blocks.map(renderBlock).join('')}</section>`)
    .join('');
  return `<main><article><h1>${esc(doc.title)}</h1><p><strong>Effective:</strong> ${esc(doc.effectiveDate)}</p>${intro}${sections}</article></main>`;
}

export interface RouteSEO {
  path: string;
  outFile: string;      // path within dist/
  title: string;
  description: string;
  bodyHtml: string;     // semantic content injected into #root for crawlers
  jsonLd: object[];     // page-specific JSON-LD (site-wide Org/WebSite added by prerender)
}

// ── Site-wide structured data ──
export function organizationLd(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url + '/',
    logo: SITE.logo,
    description: SITE.description,
    sameAs: SITE.sameAs,
    contactPoint: {
      '@type': 'ContactPoint',
      email: SITE.contactEmail,
      contactType: 'customer support',
      areaServed: 'IN',
    },
  };
}

export function websiteLd(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url + '/',
    publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url + '/' },
    // NOTE: SearchAction (sitelinks search box) is added in Phase 1b, once the
    // public discovery search endpoint exists.
  };
}

// ── The four public marketing pages ──
export function getRoutes(): RouteSEO[] {
  const landingBody = `
    <main>
      <h1>All For 1 — India’s Sports Network for Athletes, Coaches &amp; Scouts</h1>
      <p>${esc(SITE.description)}</p>
      <section>
        <h2>For athletes</h2>
        <p>Build a standout athlete profile, showcase your best highlights, track your stats,
           and put your talent in front of the scouts, coaches, and academies looking for players like you.</p>
      </section>
      <section>
        <h2>For scouts, coaches &amp; academies</h2>
        <p>Discover athletes across India by sport, position, location, and performance — including
           natural-language search with Radar, our AI talent-discovery tool.</p>
      </section>
      <section>
        <h2>Tournaments &amp; rankings</h2>
        <p>Register for tournaments, represent teams, and climb transparent, performance-based rankings.</p>
      </section>
      <nav aria-label="Get started">
        <a href="/register">Join All For 1</a> · <a href="/login">Log in</a> ·
        <a href="/challenges">Challenges</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
      </nav>
    </main>`;

  const challengesBody = `
    <main>
      <h1>Challenges on All For 1</h1>
      <p>Compete in skill challenges like the Dribble Dash, put your ability on record, and get noticed.
         Challenges let athletes prove performance and build a verifiable track record on All For 1.</p>
      <section>
        <h2>How challenges work</h2>
        <p>Take on a challenge, submit your attempt, and add the result to your athlete profile so
           scouts and coaches can see what you can do.</p>
      </section>
      <nav aria-label="Get started"><a href="/register">Join All For 1</a> · <a href="/">Home</a></nav>
    </main>`;

  return [
    {
      path: '/',
      outFile: 'index.html',
      title: 'All For 1 — India’s Sports Network for Athletes, Coaches & Scouts',
      description: SITE.description,
      bodyHtml: landingBody,
      jsonLd: [websiteLd()],
    },
    {
      path: '/challenges',
      outFile: 'challenges/index.html',
      title: 'Challenges — All For 1',
      description:
        'Compete in skill challenges like the Dribble Dash on All For 1, prove your performance, and get discovered by scouts and coaches.',
      bodyHtml: challengesBody,
      jsonLd: [],
    },
    {
      path: '/terms',
      outFile: 'terms/index.html',
      title: 'Terms & Conditions — All For 1',
      description: 'The Terms & Conditions governing use of the All For 1 platform.',
      bodyHtml: renderLegalDoc(TERMS_DOC),
      jsonLd: [],
    },
    {
      path: '/privacy',
      outFile: 'privacy/index.html',
      title: 'Privacy Policy — All For 1',
      description: 'How All For 1 collects, processes, shares, and protects your personal data.',
      bodyHtml: renderLegalDoc(PRIVACY_DOC),
      jsonLd: [],
    },
  ];
}

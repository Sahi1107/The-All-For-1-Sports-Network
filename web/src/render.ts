// SSR HTML for a public athlete profile. Consumes ONLY the safe PublicAthlete
// shape (no avatar/DOB/age/city/contact) — the gate/serializer already stripped
// everything else. Emits per-page meta + Person/ProfilePage/BreadcrumbList JSON-LD.
import { parseSlugId, type PublicAthlete } from './publicAthlete.js';
import { HEAD_STYLES, pageHeader, verifiedTick, icon } from './styles.js';
import { sportBackdropSvg } from './backdrops.js';

export const SITE_URL = 'https://allfor1.pro';
export const SITE_NAME = 'All For 1';

// Canonical entity descriptions — kept byte-identical to client/prerender/seo.ts
// (SITE.description / SITE.entityDescription) so the entity reads the same on the
// SSR pages (FAQ) as on the prerendered marketing pages.
export const SITE_DESCRIPTION =
  'All For 1 is the verified data layer for Indian grassroots sport — a LinkedIn for ' +
  'athletes to build a verified profile and get discovered by scouts & coaches.';
export const SITE_ENTITY_DESCRIPTION =
  'All For 1 is the verified data layer for Indian grassroots sport — a professional ' +
  'network, a “LinkedIn for athletes,” where athletes build a verified profile of their ' +
  'performances, stats, and achievements and get discovered by scouts, coaches, and academies.';

export const SITE_CONTACT_EMAIL = 'info@allfor1.pro';
export const SITE_LEGAL_NAME = 'The AllFor1 Network';
export const SITE_LOGO = 'https://allfor1.pro/logo-square-navy.png'; // mirrors client seo.ts SITE.logo
export const SITE_OG_IMAGE = 'https://allfor1.pro/og-image.png';

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Shared footer across every public SSR page (profiles, hubs, FAQ, about,
// safety, community-guidelines) — improves crawlability + internal linking.
// Root-relative <a href> so it works on any host; the SSR-only pages resolve via
// the allfor1-web rewrites, /privacy & /terms via Hosting's prerendered files.
export function footerHtml(): string {
  const links = [
    ['/about', 'About'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
    ['/safety', 'Safety'],
    ['/community-guidelines', 'Community Guidelines'],
    ['/faq', 'FAQ'],
    [`mailto:${SITE_CONTACT_EMAIL}`, 'Contact'],
  ]
    .map(([href, label]) => `<a href="${href}">${label}</a>`)
    .join(' · ');
  return `<footer>
      <nav aria-label="Footer">${links}</nav>
      <p>© ${new Date().getFullYear()} ${SITE_LEGAL_NAME}</p>
    </footer>`;
}

export function canonicalUrl(a: PublicAthlete): string {
  return `${SITE_URL}/athletes/${a.slug}`;
}

function titleLine(a: PublicAthlete): string {
  const parts = [a.sport ? a.sport.toLowerCase() : null, a.position, a.state].filter(Boolean);
  return parts.length ? ` — ${parts.join(' · ')}` : '';
}

function metaDescription(a: PublicAthlete): string {
  const bits = [
    a.position ? `${a.position}` : null,
    a.sport ? a.sport.toLowerCase() : null,
    a.state ? `from ${a.state}` : null,
  ].filter(Boolean).join(' ');
  return `${a.name}${bits ? ` — ${bits}` : ''} on All For 1. See sport, position, achievements, and teams.`.slice(0, 300);
}

function personLd(a: PublicAthlete, url: string): object {
  const person: Record<string, unknown> = { '@type': 'Person', name: a.name, url };
  if (a.sport) person.knowsAbout = a.sport.toLowerCase();
  if (a.state) person.homeLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', addressRegion: a.state, addressCountry: 'IN' } };
  if (a.teams.length) person.memberOf = a.teams.map((name) => ({ '@type': 'SportsTeam', name }));
  if (a.achievements.length) person.award = a.achievements;
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: person,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'All For 1', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Athletes', item: `${SITE_URL}/athletes` },
        { '@type': 'ListItem', position: 3, name: a.name, item: url },
      ],
    },
  };
}

export function renderProfile(a: PublicAthlete): string {
  const url = canonicalUrl(a);
  const title = `${a.name}${titleLine(a)} | All For 1`;
  const desc = metaDescription(a);
  const ld = JSON.stringify(personLd(a, url));

  // Address the dynamic OG card by the slug's 12-hex token (the same token
  // that's already in the URL) — never the raw UUID, keeping full ids off this
  // indexed page. If the slug somehow lacks a token, fall back to the static card.
  const ogToken = parseSlugId(a.slug);
  const ogImage = ogToken ? `${SITE_URL}/og/athlete/${ogToken}.png` : `${SITE_URL}/og-image.png`;

  const initial = esc((a.name || '?').charAt(0).toUpperCase());
  const backdrop = sportBackdropSvg(a.sport);

  // Meta line mirrors the app: role chip + sport (text-sm/80) + "· position" (70).
  const tags = [
    `<span class="af-role-chip">Athlete</span>`,
    a.sport ? `<span class="af-tag">${esc(a.sport.toLowerCase())}</span>` : '',
    a.position ? `<span class="af-tag af-tag--pos">· ${esc(a.position)}</span>` : '',
  ].join('');
  const meta = [
    a.state ? `<span>${icon('map-pin', 14)}${esc(a.state)}</span>` : '',
    a.height ? `<span>${icon('ruler', 14)}${esc(a.height)}</span>` : '',
  ].join('');

  // Section cards match the app: rounded-xl p-5, h2 (16/600) + colored lucide icon.
  const sectionCard = (title: string, iconName: string, color: string, body: string) =>
    `<div class="af-card af-section"><h2 class="af-sec"><span style="color:${color};display:inline-flex">${icon(iconName, 16)}</span>${title}</h2>${body}</div>`;
  const rows = (items: string[]) => `<div class="af-rows">${items.map((x) => `<div class="af-row">${esc(x)}</div>`).join('')}</div>`;
  const achievements = a.achievements.length ? sectionCard('Achievements', 'award', 'var(--primary-light)', rows(a.achievements)) : '';
  const teams = a.teams.length ? sectionCard('Teams', 'users', 'var(--accent)', rows(a.teams)) : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(a.name)} on All For 1" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${ogImage}" />
    ${HEAD_STYLES}
    <script type="application/ld+json">${ld}</script>
  </head>
  <body>
    ${pageHeader()}
    <main class="af-main af-main--profile">
      <nav aria-label="Breadcrumb"><a href="/">All For 1</a> › <a href="/athletes">Athletes</a> › ${esc(a.name)}</nav>
      <div class="af-card af-hero">
        ${backdrop ? `<div class="af-hero__bg" aria-hidden="true">${backdrop}</div>` : ''}
        <div class="af-hero__row">
          <div class="af-avatar" aria-hidden="true">${initial}</div>
          <div class="af-hero__info">
            <div class="af-name-row"><h1 class="af-name">${esc(a.name)}</h1>${a.verified ? verifiedTick(20) : ''}</div>
            <div class="af-tags">${tags}</div>
            ${meta ? `<div class="af-meta">${meta}</div>` : ''}
            ${a.bio ? `<p class="af-bio">${esc(a.bio)}</p>` : ''}
          </div>
        </div>
      </div>
      ${achievements}
      ${teams}
      <p class="af-joinrow"><a class="af-btn af-btn--primary af-btn--lg" href="${SITE_URL}/register">Join All For 1</a> <span class="af-note">to connect with athletes, coaches &amp; scouts</span></p>
    </main>
    ${footerHtml()}
  </body>
</html>`;
}

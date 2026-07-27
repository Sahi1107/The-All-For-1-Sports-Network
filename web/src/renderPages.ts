// SSR trust/marketing pages served by allfor1-web: /about, /safety,
// /community-guidelines. Same public-page treatment as /faq (raw HTML + JSON-LD).
// Copy is fixed, factual, and consistent with the canonical entity wording and
// with what the product actually does (the shipped exposure gate + ReportModal).
import { SITE_URL, SITE_NAME, SITE_ENTITY_DESCRIPTION, SITE_DESCRIPTION, esc } from './render.js';
import { htmlShell } from './renderHub.js';

function breadcrumbLd(name: string, path: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'All For 1', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}

function organizationLd(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: SITE_ENTITY_DESCRIPTION,
  };
}

export function renderAbout(): string {
  const canonical = `${SITE_URL}/about`;
  const main = `
      <nav aria-label="Breadcrumb"><a href="/">All For 1</a> › About</nav>
      <h1>About All For 1</h1>
      <section><h2>Our mission</h2><p>All For 1 exists to make grassroots sporting talent in India visible and verifiable — so athletes are discovered on merit, not on who they know.</p></section>
      <section><h2>What All For 1 is</h2><p>${esc(SITE_ENTITY_DESCRIPTION)}</p></section>
      <section><h2>The problem we solve</h2><p>In India, most sporting talent is discovered late, by chance, or through personal connections. A player performing at district or state level often has no way to be seen beyond their local circuit — and no trusted record of what they’ve actually done. Talent stays invisible, and merit goes unrewarded.</p></section>
      <section><h2>How we solve it</h2><p>All For 1 gives every athlete a verified profile: a durable record of performances, stats, and achievements that has been reviewed and confirmed, not just self-claimed. Scouts, coaches, and academies then discover athletes across India by sport, position, location, and verified performance — including through Radar, our AI talent-discovery tool. Verified merit becomes the way you get found.</p></section>
      <section><h2>Who we serve</h2><p>Athletes building their profile and track record; and the scouts, coaches, academies, and tournament operators looking for talent across India.</p></section>
      <p><a href="${SITE_URL}/register">Join All For 1</a> to build your verified athlete profile.</p>`;
  return htmlShell({
    title: `About — ${SITE_NAME}`,
    desc: SITE_DESCRIPTION,
    canonical,
    indexable: true,
    prose: true,
    ld: [organizationLd(), breadcrumbLd('About', '/about')],
    main,
  });
}

export function renderSafety(): string {
  const canonical = `${SITE_URL}/safety`;
  const main = `
      <nav aria-label="Breadcrumb"><a href="/">All For 1</a> › Safety</nav>
      <h1>Keeping young athletes safe</h1>
      <p>Because All For 1 is built for young athletes, safety is a design principle, not an afterthought.</p>
      <section><h2>Private by default; discovery is opt-in</h2><p>A profile is not public just because it exists. A profile is only ever publicly discoverable — in search, on hub pages, and to search engines — when the athlete is 13 or older and discovery has been explicitly enabled. Everything else stays private.</p></section>
      <section><h2>Guardian-managed accounts for under-13s</h2><p>Accounts for athletes under 13 are guardian-managed and require guardian consent. These profiles are private by default, and only the guardian can change a guardian-managed account’s visibility.</p></section>
      <section><h2>Public profiles reveal the minimum</h2><p>A public profile shows sport, position, state, and sporting achievements — never a child’s exact location (state only, never city or address) and never contact details. There are no public contact fields on a profile.</p></section>
      <section><h2>Enforced at the data layer, not just policy</h2><p>These rules aren’t a promise in a document — they’re enforced in code. An ineligible or private profile isn’t quietly hidden; the page returns a hard “not found,” so even a crawler that ignores our robots file can’t retrieve it. The same rule governs profiles, listing pages, and the sitemap.</p></section>
      <section><h2>Reporting and moderation</h2><p>Anyone can report a post, comment, message, or account. Reports are reviewed by our team, and we act on conduct that violates our <a href="/community-guidelines">Community Guidelines</a>.</p></section>
      <section><h2>Your data rights</h2><p>For all athletes under 18, registering an account requires the consent of a parent or legal guardian, in line with India’s data-protection law. All For 1 follows India’s Digital Personal Data Protection (DPDP) Act. See our <a href="/privacy">Privacy Policy</a> for full detail on how data is collected, used, and protected.</p></section>`;
  return htmlShell({
    title: `Safety — ${SITE_NAME}`,
    desc: 'How All For 1 keeps young athletes safe: private by default, guardian-managed under-13 accounts, sport + state only on public profiles, privacy enforced at the data layer, and reporting.',
    canonical,
    indexable: true,
    prose: true,
    ld: [breadcrumbLd('Safety', '/safety')],
    main,
  });
}

export function renderCommunityGuidelines(): string {
  const canonical = `${SITE_URL}/community-guidelines`;
  const items: Array<[string, string]> = [
    ['Be respectful.', 'Treat others professionally. Harassment, threats, stalking, hate speech, or abuse of any kind are not allowed.'],
    ['Be truthful.', 'Your profile, stats, and achievements must be honest. Don’t create fake or impersonating profiles or misrepresent your credentials or results — verified data is the foundation of All For 1’s trust.'],
    ['Protect minors.', 'Many young athletes use this platform. Never contact a minor inappropriately, solicit private information, or misuse any athlete’s information.'],
    ['Use the platform fairly.', 'Don’t scrape or harvest data, bypass security or rate limits, upload malware, or send spam. Don’t engage in match-fixing, doping promotion, or anything prohibited under Indian sports law.'],
    ['Respect privacy.', 'Use athlete information only for legitimate sports recruitment and development; don’t share others’ personal or contact information outside its intended purpose.'],
    ['Reporting and consequences.', 'Report anything that breaks these guidelines — reports are reviewed by our team. Violations can lead to content removal, loss of verification, suspension, or permanent removal, and we may report unlawful conduct to the authorities.'],
  ];
  const list = items.map(([b, t]) => `<li><strong>${b}</strong> ${t}</li>`).join('\n        ');
  const main = `
      <nav aria-label="Breadcrumb"><a href="/">All For 1</a> › Community Guidelines</nav>
      <h1>Community Guidelines</h1>
      <p>All For 1 is a professional network for athletes, coaches, scouts, and academies. Everyone who uses it agrees to these guidelines, which work alongside our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
      <ul>
        ${list}
      </ul>`;
  return htmlShell({
    title: `Community Guidelines — ${SITE_NAME}`,
    desc: 'The conduct and safety expectations for everyone on All For 1: be respectful, be truthful, protect minors, use the platform fairly, and respect privacy.',
    canonical,
    indexable: true,
    prose: true,
    ld: [breadcrumbLd('Community Guidelines', '/community-guidelines')],
    main,
  });
}

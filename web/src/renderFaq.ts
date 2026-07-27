// SSR /faq page — FAQPage + Organization JSON-LD in the raw HTML so answer
// engines (and Google rich results) can lift the Q&A directly. Same public-page
// treatment as profiles/hubs. Entity wording is kept identical to the marketing
// pages (see render.ts SITE_* constants, mirrored from client prerender seo.ts).
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_ENTITY_DESCRIPTION, esc } from './render.js';
import { htmlShell } from './renderHub.js';

interface QA { q: string; a: string }

// Answers are PLAIN TEXT (no markup) so they drop cleanly into both the visible
// HTML and the FAQPage JSON-LD acceptedAnswer.text.
const FAQ: QA[] = [
  {
    q: 'What is All For 1?',
    a: 'All For 1 is the verified data layer for Indian grassroots sport — a professional network, a "LinkedIn for athletes," where athletes build a verified profile of their performances, stats, and achievements and get discovered by scouts, coaches, and academies. Athletes showcase highlights, take on skill challenges, compete in tournaments, and climb transparent, performance-based rankings.',
  },
  {
    q: 'How do young athletes get discovered in India?',
    a: "Athletes create a free profile with their sport, position, stats, achievements, and highlights. Scouts, coaches, and academies then find them through search and Radar — All For 1's AI talent-discovery tool that matches athletes by sport, position, location, and performance. Verified profiles and strong performance records rank higher and stand out to recruiters.",
  },
  {
    q: 'What is a verified athlete profile / Performance Card?',
    a: 'A verified athlete profile is one whose key data — stats, performances, and achievements — has been reviewed and confirmed by the All For 1 team rather than only self-reported, so scouts and coaches can trust what they see. A Performance Card is the record of an athlete’s performances and stats on their profile; once that data is reviewed and confirmed, it carries a verified marker. This is what separates All For 1 from a profile a player simply fills in themselves.',
  },
  {
    q: 'How does All For 1 verify data?',
    a: "Today, performances and stats submitted through All For 1's challenges, tournaments, and profile submissions are reviewed and confirmed by the All For 1 team before they're marked verified — so a verified stat reflects checked data, not just a self-claim. We're expanding verification further: identity verification through DigiLocker (India's government-backed digital identity system) is on our roadmap, which will let athletes confirm their identity to a government-issued standard alongside their verified performance record.",
  },
  {
    q: 'Who is All For 1 for?',
    a: 'All For 1 is for athletes who want to be seen, and for the scouts, coaches, and academies looking for talent. Athletes — from grassroots and school/college level upward — build their profile and track record; recruiters discover and evaluate players across India by sport, position, location, and verified performance.',
  },
  {
    q: 'Is All For 1 safe for young athletes?',
    a: "Yes. Accounts for athletes under 13 are guardian-managed and require guardian consent, and a profile is only ever publicly discoverable when the athlete is 13 or older and discovery is explicitly enabled. Public profiles show sport and state only — never a child's exact location or contact details — and privacy is enforced at the data layer, not just by policy.",
  },
];

function faqPageLd(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
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

export function renderFaq(): string {
  const canonical = `${SITE_URL}/faq`;
  const title = `FAQ — ${SITE_NAME}`;
  const desc = `Frequently asked questions about All For 1: ${SITE_DESCRIPTION}`.slice(0, 300);

  const items = FAQ.map(
    (item) => `<div class="af-qa"><h2>${esc(item.q)}</h2><p>${esc(item.a)}</p></div>`,
  ).join('\n        ');

  const main = `
      <nav aria-label="Breadcrumb"><a href="/">All For 1</a> › FAQ</nav>
      <h1>Frequently Asked Questions</h1>
      <p>${esc(SITE_ENTITY_DESCRIPTION)}</p>
      ${items}
      <p><a href="${SITE_URL}/register">Join All For 1</a> to build your verified athlete profile.</p>`;

  return htmlShell({
    title,
    desc,
    canonical,
    indexable: true,
    prose: true,
    ld: [
      faqPageLd(),
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'All For 1', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'FAQ', item: canonical },
        ],
      },
      organizationLd(),
    ],
    main,
  });
}

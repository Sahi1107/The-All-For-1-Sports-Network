// SSR /learn hub + articles (AEO content) served by allfor1-web. Same treatment
// as /faq and /about: raw-HTML content + Article/CollectionPage + BreadcrumbList
// JSON-LD, canonical entity language, accurate product claims (performance
// verification is admin-reviewed today; DigiLocker identity is roadmap).
import { SITE_URL, SITE_NAME, SITE_LOGO, SITE_OG_IMAGE, esc } from './render.js';
import { htmlShell } from './renderHub.js';

const PUBLISHED = '2026-07-23';

interface Article {
  slug: string;
  title: string;       // <title> (with brand)
  description: string; // meta description
  h1: string;          // H1 + JSON-LD headline
  body: string;        // article HTML (trusted, static — no user input)
}

const ARTICLES: Article[] = [
  {
    slug: 'how-athletes-get-discovered-in-india',
    title: 'How Do Young Athletes Get Discovered in India? | All For 1',
    description:
      'How talent discovery really works in Indian sport — school and district tournaments, academies, government pathways, and how a verified online profile helps athletes get found on merit.',
    h1: 'How do young athletes get discovered in India?',
    body: `
        <p>For a talented young athlete in India, being good is only half the challenge. The other half is being <em>seen</em>. Every year, thousands of players perform brilliantly at school, club, and district level and are never noticed by anyone who could take their career further. Understanding how discovery actually works — and where it breaks down — is the first step to getting found.</p>
        <h2>The traditional routes to discovery</h2>
        <p>Most athletes in India are still discovered through a handful of long-established channels:</p>
        <ul>
          <li><strong>School and college sport.</strong> For many, competitive sport begins here. Strong performances in inter-school and inter-college competitions can attract the attention of physical-education teachers, local coaches, and academy scouts.</li>
          <li><strong>District, state, and national tournaments.</strong> Indian sport is built on a pyramid of representative competition. Standing out at district level can earn a place in state squads, and state performances feed national selection.</li>
          <li><strong>Academies and clubs.</strong> Private academies, residential sports schools, and clubs act as talent funnels, developing players and putting them in front of selectors and recruiters.</li>
          <li><strong>Government pathways.</strong> Programmes like Khelo India and the Sports Authority of India (SAI) run talent-identification schemes, trials, and development centres designed to surface and support promising athletes, especially at grassroots and junior levels.</li>
          <li><strong>Trials, camps, and word of mouth.</strong> A great deal of discovery still happens informally — a coach recommends a player, a scout attends a match, a selector runs an open trial.</li>
        </ul>
        <p>Each of these routes works. The problem is that they are uneven, and they favour athletes who are already close to the system.</p>
        <h2>Why so much talent slips through</h2>
        <ul>
          <li><strong>Geography.</strong> Scouts, academies, and recruiters are concentrated in cities and a few sporting hubs. Talent, however, is everywhere — in small towns, villages, and districts far from any selector's usual circuit. A brilliant player in a remote area may simply never cross paths with someone who can advance their career.</li>
          <li><strong>No record that travels.</strong> An athlete might dominate a local league, but if those performances aren't captured anywhere, they disappear the moment the tournament ends. There is no durable, portable record of what they've actually done.</li>
          <li><strong>Gatekeeping and connections.</strong> When discovery depends on who you know, athletes without the right introductions are at a disadvantage regardless of ability.</li>
          <li><strong>Timing and luck.</strong> Being seen often comes down to the right person watching the right match on the right day. That's a fragile foundation for a career.</li>
        </ul>
        <p>The result is a system where merit and visibility don't always match. Plenty of discovered athletes are genuinely excellent — but so are many who were never discovered at all.</p>
        <h2>What actually gets an athlete noticed</h2>
        <p>Strip away the specifics and a few things consistently move the needle:</p>
        <ol>
          <li><strong>Verifiable performance</strong> — not just claims, but results a recruiter can trust: statistics, competition records, and outcomes that have been confirmed rather than self-reported.</li>
          <li><strong>A record that travels</strong> — achievements that live in one place, stay current, and can be looked up long after the match is over.</li>
          <li><strong>Being findable</strong> — if a scout is looking for a left-arm fast bowler under 19 in a particular state, the athletes who can be searched and filtered are the ones who get shortlisted.</li>
        </ol>
        <h2>How a verified online profile changes the equation</h2>
        <p>This is the gap digital platforms are built to close. All For 1 is the verified data layer for Indian grassroots sport — a professional network, a "LinkedIn for athletes," where athletes build a verified profile of their performances, stats, and achievements and get discovered by scouts, coaches, and academies.</p>
        <p>Two things make this different from simply posting highlights online:</p>
        <ul>
          <li><strong>Verification.</strong> On All For 1, an athlete's key data — stats, performances, and achievements — is reviewed and confirmed by the All For 1 team rather than only self-reported. That's what lets a scout trust a profile they've never met in person. (Identity verification through DigiLocker, India's government-backed digital identity system, is on the roadmap to strengthen this further.)</li>
          <li><strong>Discoverability.</strong> Recruiters can search across athletes by sport, position, location, and performance — including through Radar, All For 1's AI talent-discovery tool, which turns a natural-language request into a shortlist. A verified profile means an athlete in a small town is as findable as one in a metro.</li>
        </ul>
        <h2>Practical steps for a young athlete</h2>
        <ul>
          <li><strong>Compete, and keep a record.</strong> Play in ranked competitions and hold on to the evidence — scorecards, results, certificates.</li>
          <li><strong>Build a profile a stranger can trust.</strong> Fill in your sport, position, and honest statistics, and get them verified where you can.</li>
          <li><strong>Keep it current.</strong> A profile reflecting your latest performances is far more useful than one frozen a season ago.</li>
          <li><strong>Make yourself findable.</strong> Be where recruiters actually look, and make sure your details are searchable.</li>
        </ul>
        <p>Discovery in India is changing from something that happens <em>to</em> a lucky few into something an athlete can actively build toward. The talent has always been there. What's new is the ability to make it visible — on merit, and to the right people.</p>
        <p><a href="${SITE_URL}/register">Build your verified athlete profile on All For 1.</a></p>`,
  },
  {
    slug: 'what-is-an-athlete-performance-card',
    title: 'What Is an Athlete Performance Card? | All For 1',
    description:
      'An Athlete Performance Card is a verified, structured record of an athlete\'s performances and stats — what it includes, why verification matters, and how it helps athletes get discovered.',
    h1: 'What is an Athlete Performance Card?',
    body: `
        <p>Every professional has a way of proving what they've done. A doctor has credentials; an engineer has a portfolio; a job-seeker has a résumé backed by references. Athletes, especially at the grassroots level, have rarely had an equivalent — a trusted, structured record of their performance that someone else can rely on. An Athlete Performance Card is that record.</p>
        <h2>A verified record, not a self-reported one</h2>
        <p>At its simplest, a Performance Card is the record of an athlete's performances and statistics, presented on their profile. But the important word is <em>verified</em>. Anyone can write "I scored 40 goals last season" on a social profile. The question a scout, coach, or academy always has to ask is: <em>is it true?</em></p>
        <p>A Performance Card is designed to answer that. On All For 1, once an athlete's performance data has been reviewed and confirmed, it carries a verified marker — signalling that this isn't just a self-claim, but data that has been checked. That single distinction is what separates a Performance Card from a profile a player simply fills in themselves.</p>
        <h2>What's on a Performance Card</h2>
        <p>The exact contents depend on the sport, but a Performance Card typically brings together:</p>
        <ul>
          <li><strong>Core performance statistics</strong> — the numbers that matter for the athlete's sport and position (runs, wickets, goals, assists, timings, and so on).</li>
          <li><strong>Competition record</strong> — the tournaments, matches, and events the athlete has taken part in, and how they performed.</li>
          <li><strong>Achievements</strong> — titles, selections, and milestones.</li>
          <li><strong>Context</strong> — sport, position, and level of play, so the numbers can be understood properly.</li>
        </ul>
        <p>Presented together, these turn a vague sense of "this player is good" into something specific and comparable.</p>
        <h2>Why verification is the whole point</h2>
        <p>Grassroots sport runs on trust, and trust is exactly what's hardest to establish at a distance. A recruiter looking at an unknown athlete from a town they've never visited has no easy way to separate genuine ability from exaggeration. That uncertainty is a big reason talented players from outside the usual networks get overlooked — the risk of being wrong is too high.</p>
        <p>Verification removes that friction. When the underlying data has been reviewed and confirmed rather than self-reported, a scout can act on it with confidence. The athlete no longer has to be personally known or vouched for; the record speaks for itself. In effect, verification lets merit travel.</p>
        <h2>How a Performance Card is verified</h2>
        <p>It's worth being precise about how verification works today, and where it's heading. Today, performances and stats submitted through All For 1 — via challenges, tournaments, and profile submissions — are reviewed and confirmed by the All For 1 team before they're marked verified. A verified stat therefore reflects checked data, not just a self-claim.</p>
        <p>Looking ahead, All For 1 is expanding verification further. Identity verification through DigiLocker — India's government-backed digital identity system — is on the roadmap. This will let athletes confirm their identity to a government-issued standard alongside their verified performance record. To be clear: performance verification is live today; DigiLocker-based identity verification is a planned addition, not a current feature.</p>
        <h2>A Performance Card vs. a highlight reel</h2>
        <p>Highlight videos are valuable — they show flair, technique, and moments numbers can't capture. But a reel has two limits as a discovery tool. First, it's curated: it shows an athlete's best moments, not their consistency. Second, it's hard to search or compare — a recruiter can't filter a thousand videos to find "defenders in Goa with a strong last season." A Performance Card adds what the reel lacks: structured, verified, comparable data. Together, the two give a fuller, more honest picture — the story <em>and</em> the evidence.</p>
        <h2>Why it matters for discovery</h2>
        <p>The practical payoff is that a Performance Card makes an athlete both <em>trustworthy</em> and <em>findable</em>:</p>
        <ul>
          <li><strong>Trustworthy</strong>, because verified data lowers the risk for anyone considering them.</li>
          <li><strong>Findable</strong>, because structured data can be searched and filtered. On All For 1, recruiters discover athletes by sport, position, location, and performance — including through Radar, an AI talent-discovery tool — and verified profiles stand out.</li>
        </ul>
        <p>For a young athlete, the takeaway is simple: talent gets you noticed, but a verified record is what lets someone act on it. A Performance Card is how you turn what you've done on the field into something a scout, coach, or academy can trust from anywhere. All For 1 lets any athlete build one for free — but the idea is bigger than any one platform. As grassroots sport digitises, a trusted record of performance is becoming as fundamental to an athlete's career as a résumé is to any other professional.</p>
        <p><a href="${SITE_URL}/register">Start your verified Performance Card on All For 1.</a></p>`,
  },
  {
    slug: 'why-indian-talent-goes-undiscovered',
    title: 'Why India\'s Grassroots Sporting Talent Goes Undiscovered | All For 1',
    description:
      'India produces enormous sporting talent, yet much of it is never discovered. The structural reasons — geography, missing records, gatekeeping, fragmentation — and what\'s changing.',
    h1: 'Why India\'s grassroots sporting talent goes undiscovered',
    body: `
        <p>India is a nation of more than a billion people with a deep, everyday love of sport. By the law of numbers alone, it should be overflowing with discovered athletes across every discipline. In many sports, it isn't. The talent exists — anyone who has watched a local cricket match on a dusty maidan or a district football final knows that — but a great deal of it never reaches the people who could turn ability into a career. Understanding <em>why</em> is the first step to fixing it.</p>
        <h2>A pipeline with too many leaks</h2>
        <p>Talent discovery works like a pipeline: players perform, someone notices, and the best move up. In India that pipeline exists — through schools, clubs, academies, district and state tournaments, and government programmes like Khelo India and the Sports Authority of India. But it leaks badly. At every stage, capable athletes drop out of view not because they weren't good enough, but because the system never registered them. The reasons are structural, and they compound one another.</p>
        <h2>The geography problem</h2>
        <p>India's talent is spread across thousands of towns and villages. Its scouts, academies, and recruiters are not — they cluster in cities and a few established sporting centres. The further an athlete is from those hubs, the less likely they are to be seen. A gifted player in a small district might dominate every competition within reach and still never meet a selector, simply because no one from the system was ever there. Ability is distributed evenly; the opportunity to be noticed is not.</p>
        <h2>The missing-record problem</h2>
        <p>Even when talented athletes perform, their performances usually vanish. A player might take five wickets in a crucial match or top the scoring charts across a season, but if those results aren't captured in any durable, trustworthy form, they leave no trace. When that athlete later tries to prove themselves to a coach or academy, they have nothing to show but their own word — and an unverified claim from an unknown player is understandably hard for a recruiter to act on. Without a portable, verified record, athletes effectively start from zero every time they meet someone new.</p>
        <h2>The gatekeeping problem</h2>
        <p>Where discovery depends on personal connections, it quietly filters for the wrong thing. An athlete with a well-connected coach, a family in the sport, or access to the right academy has a path in. An equally talented athlete without those connections may not — not because of any decision against them, but because the informal networks that drive so much scouting never reach them. Merit and access get tangled together, and access wins more often than it should.</p>
        <h2>The fragmentation problem</h2>
        <p>Perhaps the deepest issue is that India's grassroots sporting data is scattered and informal. Results live in the memories of local organisers, in paper scoresheets, in WhatsApp groups, in the occasional local news report. There is no common, trusted layer where an athlete's verified record exists and can be found. Without that, discovery stays manual, local, and slow — dependent on individual scouts covering ground that no number of scouts could ever fully cover.</p>
        <h2>What's changing</h2>
        <p>None of these problems are about a shortage of talent or effort. They're about infrastructure — the missing connective tissue between athletes and the people looking for them. And that is exactly what is now being built.</p>
        <p>The shift is toward a verified data layer for grassroots sport: a place where an athlete anywhere can build a trusted, structured record of who they are and what they've done, and where recruiters can find them on merit rather than proximity. This is the idea behind All For 1 — a professional network, a "LinkedIn for athletes," where athletes build a verified profile of their performances, stats, and achievements and get discovered by scouts, coaches, and academies.</p>
        <p>Two capabilities matter most for closing the gaps above:</p>
        <ul>
          <li><strong>Verification</strong> tackles the missing-record and trust problems. When an athlete's stats and performances are reviewed and confirmed rather than self-reported, their record becomes something a stranger can rely on. (Performance data is verified through team review today; identity verification via DigiLocker, India's government-backed digital identity system, is on the roadmap.)</li>
          <li><strong>Searchable discovery</strong> tackles the geography and gatekeeping problems. When athletes are findable by sport, position, location, and verified performance — including through tools like Radar, which turns a natural-language request into a shortlist — a player's location and connections matter far less than their record.</li>
        </ul>
        <p>None of this replaces coaches, academies, or government pathways; it strengthens them, by making the pool of visible talent far larger and more trustworthy than any single scout could assemble by hand.</p>
        <h2>The bottom line</h2>
        <p>India's grassroots talent goes undiscovered not for lack of ability, but for lack of visibility and verifiable proof. The players are on the field already. What has been missing is the infrastructure to record what they do, verify it, and make it findable — so that being discovered depends on merit, not on where you happen to live or who you happen to know. Building that layer is how a country full of talent finally gets to see it.</p>
        <p><a href="${SITE_URL}/register">Join All For 1</a> and put your talent on the map.</p>`,
  },
];

const BY_SLUG = new Map(ARTICLES.map((a) => [a.slug, a]));

/** Slugs for the sitemap generator. */
export function learnSlugs(): string[] {
  return ARTICLES.map((a) => a.slug);
}

function articleLd(a: Article, canonical: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.h1,
    description: a.description,
    inLanguage: 'en-IN',
    datePublished: PUBLISHED,
    dateModified: PUBLISHED,
    image: SITE_OG_IMAGE,
    mainEntityOfPage: canonical,
    author: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/` },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: SITE_LOGO },
    },
  };
}

function breadcrumbLd(trail: Array<{ name: string; item: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, item: t.item,
    })),
  };
}

/** Cross-links to the other articles — internal linking + engagement. */
function relatedHtml(current: Article): string {
  const others = ARTICLES.filter((a) => a.slug !== current.slug)
    .map((a) => `<li><a href="/learn/${a.slug}">${esc(a.h1)}</a></li>`)
    .join('');
  return `<nav aria-label="More articles"><h2>Continue reading</h2><ul>${others}</ul></nav>`;
}

/** Render a single article, or null if the slug is unknown (→ caller 404s). */
export function renderLearnArticle(slug: string): string | null {
  const a = BY_SLUG.get(slug);
  if (!a) return null;
  const canonical = `${SITE_URL}/learn/${a.slug}`;
  const main = `
      <nav aria-label="Breadcrumb"><a href="/">All For 1</a> › <a href="/learn">Learn</a> › ${esc(a.h1)}</nav>
      <article>
        <h1>${esc(a.h1)}</h1>
        ${a.body}
      </article>
      ${relatedHtml(a)}`;
  return htmlShell({
    title: a.title,
    desc: a.description,
    canonical,
    indexable: true,
    prose: true,
    ld: [
      articleLd(a, canonical),
      breadcrumbLd([
        { name: 'All For 1', item: `${SITE_URL}/` },
        { name: 'Learn', item: `${SITE_URL}/learn` },
        { name: a.h1, item: canonical },
      ]),
    ],
    main,
  });
}

/** The /learn index — content hub listing all articles. */
export function renderLearnIndex(): string {
  const canonical = `${SITE_URL}/learn`;
  const cards = ARTICLES.map(
    (a) => `<a class="af-qa" href="/learn/${a.slug}" style="display:block"><h2>${esc(a.h1)}</h2><p>${esc(a.description)}</p></a>`,
  ).join('\n      ');
  const main = `
      <nav aria-label="Breadcrumb"><a href="/">All For 1</a> › Learn</nav>
      <h1>Learn</h1>
      <p>Guides and explainers from All For 1 on how athletes get discovered in India, verified Performance Cards, and why grassroots talent goes unseen.</p>
      ${cards}`;
  return htmlShell({
    title: `Learn — ${SITE_NAME}`,
    desc: 'Guides and explainers from All For 1 on athlete discovery in India, verified Performance Cards, and grassroots sport.',
    canonical,
    indexable: true,
    prose: true,
    ld: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `Learn — ${SITE_NAME}`,
        url: canonical,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: ARTICLES.length,
          itemListElement: ARTICLES.map((a, i) => ({
            '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/learn/${a.slug}`, name: a.h1,
          })),
        },
      },
      breadcrumbLd([
        { name: 'All For 1', item: `${SITE_URL}/` },
        { name: 'Learn', item: canonical },
      ]),
    ],
    main,
  });
}

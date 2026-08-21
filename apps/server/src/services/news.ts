import logger from '../utils/logger';

// Sports-news source for the feed's right-rail news module.
//
// EDITORIAL CONTROL, BY DESIGN: this rail renders next to minors' profiles, so
// what appears here must never be an open third-party feed that could surface
// arbitrary (or inappropriate) headlines. Control is therefore kept at three
// gates rather than by freezing the list:
//   1. SOURCES is an allow-list of named outlets' own sport feeds — nothing else
//      is ever fetched, and an item is dropped unless its link is on that
//      outlet's host (a hijacked feed can't redirect our readers offsite).
//   2. BLOCKED drops betting/gambling and adult-content headlines outright.
//   3. Items are ranked by India-sport relevance — Olympic pathway, grassroots
//      and school/junior sport, the sports ministry and SAI, and the domestic
//      leagues — so the rail leads with what this platform is actually about.
// CURATED below stays as the guaranteed fallback: if every feed is unreachable
// the rail still renders reviewed, evergreen links instead of going blank.

export interface NewsItem {
  id: string;
  title: string;
  source: string;      // publication name (shown as attribution)
  url: string;         // opens in a new tab
  category: string;    // short tag, e.g. "Grassroots"
  sport?: string | null; // Sport enum value the headline is about, when it is about one
}

// ─── Allow-listed sources ────────────────────────────────────────────────────

interface Source {
  name: string;
  feed: string;
  host: string; // items must link to this host (suffix-matched)
}

const SOURCES: Source[] = [
  { name: 'The Bridge',      feed: 'https://thebridge.in/feed/',                                  host: 'thebridge.in' },
  { name: 'Sportstar',       feed: 'https://sportstar.thehindu.com/feeder/default.rss',           host: 'sportstar.thehindu.com' },
  { name: 'Indian Express',  feed: 'https://indianexpress.com/section/sports/feed/',              host: 'indianexpress.com' },
  { name: 'Hindustan Times', feed: 'https://www.hindustantimes.com/feeds/rss/sports/rssfeed.xml', host: 'hindustantimes.com' },
  { name: 'NDTV Sports',     feed: 'https://feeds.feedburner.com/ndtvsports-latest',              host: 'sports.ndtv.com' },
];

// ─── Relevance + safety ──────────────────────────────────────────────────────

/** Cross-cutting themes: what this platform is about, whatever the sport. These
 *  outrank a bare sport match, so a Khelo India basketball story reads as
 *  "Grassroots" rather than "Basketball". */
const THEMES: { tag: string; weight: number; re: RegExp }[] = [
  { tag: 'Grassroots',      weight: 5, re: /\b(grassroot|academy|academies|school|inter-school|junior|sub-junior|youth|under[- ]?\d{2}|u-?\d{2}|khelo india|talent (hunt|search)|scholarship)\b/i },
  { tag: 'Sports Ministry', weight: 5, re: /\b(sports ministry|ministry of youth affairs|sports authority of india|\bSAI\b|khelo india|national sports (policy|bill|governance)|sports minister)\b/i },
  { tag: 'Olympic pathway', weight: 4, re: /\b(olympic|olympics|paralympic|asian games|commonwealth games|world championship|world c'?ship|qualifier|IOA|indian olympic association)\b/i },
  { tag: 'Nationals',       weight: 4, re: /\b(national (games|championship|meet)|nationals|state (league|championship)|ranji|santosh trophy|federation cup)\b/i },
  { tag: 'Leagues',         weight: 3, re: /\b(indian super league|\bISL\b|I-League|\bIPL\b|pro kabaddi|prime volleyball|ultimate kho kho|premier handball|\bNBA India\b|hockey india league)\b/i },
];

/** Which sport a headline is about, keyed by the platform's Sport enum, so the
 *  rail can lead with the viewer's own sport. A headline matching none of these
 *  has no sport and is only ever general filler. */
const SPORTS: Record<string, RegExp> = {
  BASKETBALL:   /\b(basketball|3x3|\bNBA\b|\bWNBA\b|hoops)\b/i,
  FOOTBALL:     /\b(football|soccer|indian super league|\bISL\b|I-League|\bAIFF\b|\bFIFA\b|santosh trophy)\b/i,
  CRICKET:      /\b(cricket|\bBCCI\b|ranji|\bIPL\b|test match|\bODI\b|\bT20\b|batter|bowler)\b/i,
  FIELD_HOCKEY: /\b(hockey|\bFIH\b|hockey india)\b/i,
  BADMINTON:    /\b(badminton|\bBWF\b|shuttler|\bBAI\b)\b/i,
  ATHLETICS:    /\b(athletics|javelin|sprint(er)?|marathon|long jump|triple jump|high jump|shot put|discus|relay|steeplechase)\b/i,
  WRESTLING:    /\b(wrestling|wrestler|kushti|\bWFI\b)\b/i,
  BOXING:       /\b(boxing|boxer|pugilist)\b/i,
  SHOOTING:     /\b(shooting|shooter|rifle|pistol|trap|skeet|\bNRAI\b)\b/i,
  WEIGHTLIFTING:/\b(weightlifting|weightlifter|snatch|clean and jerk)\b/i,
  ARCHERY:      /\b(archery|archer|recurve|compound bow)\b/i,
  // Negative lookbehind so "table tennis" never reads as tennis.
  TENNIS:       /\b(?<!table )(tennis|\bATP\b|\bWTA\b|grand slam)\b/i,
  TABLE_TENNIS: /\b(table tennis|paddler|\bTTFI\b)\b/i,
  RUGBY:        /\brugby\b/i,
  SWIMMING:     /\b(swimming|swimmer|freestyle|backstroke|breaststroke|butterfly stroke)\b/i,
  VOLLEYBALL:   /\b(volleyball|prime volleyball)\b/i,
};

/** Display label for a sport tag when no theme claims the headline. */
const SPORT_LABEL: Record<string, string> = {
  BASKETBALL: 'Basketball', FOOTBALL: 'Football', CRICKET: 'Cricket',
  FIELD_HOCKEY: 'Hockey', BADMINTON: 'Badminton', ATHLETICS: 'Athletics',
  WRESTLING: 'Wrestling', BOXING: 'Boxing', SHOOTING: 'Shooting',
  WEIGHTLIFTING: 'Weightlifting', ARCHERY: 'Archery', TENNIS: 'Tennis',
  TABLE_TENNIS: 'Table tennis', RUGBY: 'Rugby', SWIMMING: 'Swimming',
  VOLLEYBALL: 'Volleyball',
};

/** India-facing coverage gets a lift: these outlets also carry global wires. */
const INDIA = /\b(india|indian|bharat|bengaluru|mumbai|delhi|chennai|kolkata|hyderabad|pune|goa|kerala|punjab|haryana|odisha|manipur|assam)\b/i;

/** Never shown next to a minor's profile, whatever the outlet filed it under. */
const BLOCKED = /\b(bet|bets|betting|odds|bookmaker|casino|jackpot|fantasy (league|team|xi) tips|dream11|satta|porn|sex|nude|escort|drug bust|doping scandal|suicide|death threat)\b/i;

/** Celebrity-personal-life filler. These sit inside the sport sections we pull
 *  from and would otherwise take a scarce slot — a sport with only three stories
 *  filed today can have one of them be an athlete's marriage or net worth. This
 *  rail is a sports rail for young athletes, so they don't run. */
const TABLOID = /(\bnet worth\b|\bis [a-z.' ]{2,24} married\b|all about (his|her) (son|daughter|wife|husband|kids|family)|\b(girlfriend|boyfriend|love life|personal life)\b|dating rumou?rs)/i;

// ─── Curated fallback (reviewed, evergreen) ──────────────────────────────────

const CURATED: NewsItem[] = [
  { id: 'bridge-grassroots',  title: 'Grassroots watch: the academies quietly building India’s next generation', source: 'The Bridge',       url: 'https://thebridge.in/grassroots-sports/', category: 'Grassroots' },
  { id: 'sportstar-schools',  title: 'School and junior nationals: results, breakout names and what’s next',      source: 'Sportstar',        url: 'https://sportstar.thehindu.com/',        category: 'Youth' },
  { id: 'olympics-india',     title: 'India at the Olympics: pathway athletes and development updates',            source: 'Olympics.com',     url: 'https://olympics.com/en/news/india',     category: 'Pathway' },
  { id: 'bridge-basketball',  title: 'Indian basketball’s grassroots surge — leagues, courts and talent',          source: 'The Bridge',       url: 'https://thebridge.in/basketball/',       category: 'Basketball' },
  { id: 'ie-sport',           title: 'Indian sport today: leagues, nationals and the athletes coming through',     source: 'Indian Express',   url: 'https://indianexpress.com/section/sports/', category: 'Sport' },
];

// ─── Feed reading ────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 6000;
const MAX_FEED_BYTES = 3 * 1024 * 1024;
const REFRESH_MS = 24 * 60 * 60 * 1000; // once a day
const PER_SOURCE_CAP = 2;               // no single outlet can fill the general slots
const SPORT_SOURCE_CAP = 3;             // looser: a niche sport may have one outlet covering it
const POOL_SIZE = 250;                  // cached pool the per-viewer rail is chosen from
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // how far back the pool remembers

const stripCdata = (s: string) => s.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');

/** Decode the handful of entities RSS titles actually carry, then flatten any
 *  stray markup. Titles are rendered as text, so this is for readability. */
function decode(raw: string): string {
  return stripCdata(raw)
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (item: string, name: string): string | null => {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : null;
};

interface RawItem { title: string; url: string; published: number; source: Source }

/** A pool entry: a rail item plus the two fields the pool ranks and ages it by.
 *  Both are stripped before the item is served. */
interface PoolItem extends NewsItem { published: number; weight: number }

/** The item's link, if it is an https URL on the outlet's own host — otherwise
 *  null. A feed we don't control must not be able to point our readers anywhere
 *  but the outlet it claims to be. Suffix-matched on a dot, so
 *  `thebridge.in.evil.com` does not pass as `thebridge.in`.
 *  Exported for tests. */
export function linkAllowed(link: string, host: string): string | null {
  let url: URL;
  try { url = new URL(link); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== host && !url.hostname.endsWith(`.${host}`)) return null;
  return url.toString();
}

/** Fetch one feed and pull out its items. Never throws: a source that is down,
 *  slow or malformed simply contributes nothing to this refresh. */
async function readFeed(source: Source): Promise<RawItem[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(source.feed, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'AllFor1NewsRail/1.0 (+https://allfor1.pro)', Accept: 'application/rss+xml, application/xml, text/xml' },
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const xml = (await res.text()).slice(0, MAX_FEED_BYTES);
    const items: RawItem[] = [];

    for (const [, body] of xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)) {
      const title = tag(body, 'title');
      const link = tag(body, 'link');
      if (!title || !link) continue;

      const url = linkAllowed(link, source.host);
      if (!url) continue;

      const date = tag(body, 'pubDate') ?? tag(body, 'dc:date');
      const published = date ? Date.parse(date) : NaN;
      items.push({
        title,
        url,
        published: Number.isNaN(published) ? 0 : published,
        source,
      });
    }
    return items;
  } catch (error) {
    logger.warn('news.feed_unavailable', { source: source.name, error: String(error) });
    return [];
  }
}

/** Tag, ranking weight and sport for a headline, or null if it clears no gate —
 *  blocked outright, or too far from what this platform covers to show.
 *  Exported for tests. */
export function classify(
  title: string,
): { tag: string; weight: number; sport: string | null } | null {
  if (BLOCKED.test(title) || TABLOID.test(title)) return null;

  const theme = THEMES.find((t) => t.re.test(title));
  const sport = Object.keys(SPORTS).find((key) => SPORTS[key].test(title)) ?? null;
  const indiaBonus = INDIA.test(title) ? 3 : 0;

  // A theme names the headline; a bare sport match is worth less but still
  // qualifies, since it is exactly what a viewer of that sport wants to see.
  if (theme) return { tag: theme.tag, weight: theme.weight + indiaBonus, sport };
  if (sport) return { tag: SPORT_LABEL[sport], weight: 2 + indiaBonus, sport };
  return indiaBonus ? { tag: 'Indian sport', weight: indiaBonus, sport: null } : null;
}

/** Read every allow-listed feed, filter, rank and de-duplicate into one pool.
 *  No per-source cap here — the cache is a POOL, not the rail. Capping at
 *  ingestion would starve the sport-specific slots later: a niche sport is
 *  often covered by only one of these outlets. */
async function collect(): Promise<PoolItem[]> {
  const feeds = await Promise.all(SOURCES.map(readFeed));

  const scored = feeds.flat().flatMap((raw) => {
    const hit = classify(raw.title);
    return hit ? [{ ...raw, ...hit }] : [];
  });

  // Freshness first (day-granular, so a same-day set stays topic-ranked), then
  // how squarely the headline lands on what this platform covers.
  const day = (ms: number) => Math.floor(ms / 86_400_000);
  scored.sort((a, b) => day(b.published) - day(a.published) || b.weight - a.weight);

  const seen = new Set<string>();
  const out: PoolItem[] = [];

  for (const item of scored) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${item.source.host}-${key.slice(0, 32)}`,
      title: item.title,
      source: item.source.name,
      url: item.url,
      category: item.tag,
      sport: item.sport,
      // An item sitting in a feed with no readable date is treated as current.
      published: item.published || Date.now(),
      weight: item.weight,
    });
    if (out.length >= POOL_SIZE) break;
  }
  return out;
}

// ─── Choosing what one viewer sees ───────────────────────────────────────────

/** Take up to `n` items in pool order, skipping anything already chosen and
 *  holding each outlet to `cap` so one publication can't fill the rail. */
function take(pool: PoolItem[], n: number, chosen: Set<string>, perSource: Map<string, number>, cap: number): PoolItem[] {
  const out: PoolItem[] = [];
  for (const item of pool) {
    if (out.length >= n) break;
    if (chosen.has(item.id)) continue;
    const used = perSource.get(item.source) ?? 0;
    if (used >= cap) continue;
    chosen.add(item.id);
    perSource.set(item.source, used + 1);
    out.push(item);
  }
  return out;
}

/**
 * The rail for one viewer: their own sport first, then the wider Indian sport
 * picture. An athlete should open the app and see their game — but the rail is
 * also how they find out what is happening elsewhere, so it is never given over
 * entirely to one sport. With no sport on the profile (or nothing published in
 * it today) this degrades to the plain ranked list.
 * Exported for tests.
 */
export function selectForSport(pool: PoolItem[], limit: number, sport?: string | null): NewsItem[] {
  const chosen = new Set<string>();
  const perSource = new Map<string, number>();

  // Roughly three in five, so the viewer's sport clearly leads without
  // crowding out everything else.
  const mine = sport ? pool.filter((i) => i.sport === sport) : [];
  const slots = Math.min(mine.length, Math.round(limit * 0.6));

  // The sport group gets the looser cap: for a sport only one outlet covers,
  // the general cap would leave those slots empty for no reader benefit.
  const lead = take(mine, slots, chosen, perSource, SPORT_SOURCE_CAP);
  const fill = take(pool, limit - lead.length, chosen, perSource, PER_SOURCE_CAP);
  return [...lead, ...fill].map(({ published: _p, weight: _w, ...item }) => item);
}

// ─── Daily cache ─────────────────────────────────────────────────────────────
//
// A lazy per-instance cache rather than a scheduled job: the API runs on Cloud
// Run with no scheduler wired up, so the first read after the TTL expires
// triggers the refresh. Only the very first read of a cold instance waits on
// the network; every later one is served from memory while the refresh happens
// behind it, so the rail never blocks a feed render.

let cache: PoolItem[] = [];
let succeededAt = 0;   // last refresh that actually produced items
let attemptedAt = 0;   // last refresh attempt, successful or not
let inFlight: Promise<void> | null = null;

const RETRY_MS = 10 * 60 * 1000; // backoff after a refresh that produced nothing

/** Whether to go out to the feeds now: the cache has aged past a day, and we
 *  haven't just tried. The second half matters — without it a spell where every
 *  outlet is unreachable would send a request per feed render, since a failed
 *  refresh never advances the daily clock. */
function due(): boolean {
  const now = Date.now();
  if (now - succeededAt < REFRESH_MS) return false;
  return now - attemptedAt >= RETRY_MS;
}

/** Fold a fresh read into the existing pool, newest first, dropping anything
 *  past MAX_AGE_MS. The pool spans days rather than one read on purpose: the
 *  Indian outlets file only a handful of basketball or swimming stories in a
 *  given day, so a single snapshot would leave those athletes with a rail that
 *  never mentions their sport. Today's news still sorts to the top, so the
 *  general slots stay current. */
function merge(fresh: PoolItem[], existing: PoolItem[]): PoolItem[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  const byId = new Map<string, PoolItem>();
  for (const item of [...fresh, ...existing]) {
    if (item.published < cutoff) continue;
    if (!byId.has(item.id)) byId.set(item.id, item); // the fresh copy wins
  }
  // Re-rank across both runs: merging two already-sorted lists on the day alone
  // would leave a day holding a fresh run followed by a stale one.
  const day = (ms: number) => Math.floor(ms / 86_400_000);
  return [...byId.values()]
    .sort((a, b) => day(b.published) - day(a.published) || b.weight - a.weight)
    .slice(0, POOL_SIZE);
}

function refresh(): Promise<void> {
  // One refresh at a time: a burst of feed renders past the TTL must not turn
  // into a burst of outbound requests to every outlet.
  if (inFlight) return inFlight;
  attemptedAt = Date.now();
  const run = collect()
    .then((items) => {
      // Keep the last good set if a refresh comes back empty (every feed down,
      // or everything filtered out) — better stale than blank.
      if (items.length) {
        cache = merge(items, cache);
        succeededAt = Date.now();
      } else {
        logger.warn('news.refresh_empty');
      }
    })
    .catch((error) => {
      logger.error('news.refresh_failed', { error: String(error) });
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = run;
  return run;
}

/**
 * The news items shown in one viewer's rail — refreshed daily from the
 * allow-listed outlets above and led by `sport` (the viewer's profile sport),
 * falling back to the curated evergreen list until the first refresh lands (or
 * if every source is unreachable). Never rejects.
 */
export async function getNews(limit = 5, sport?: string | null): Promise<NewsItem[]> {
  if (due()) {
    const pending = refresh();
    // Only a cold instance with nothing to show waits on the network; every
    // other read is served from memory while the refresh runs behind it.
    if (!cache.length) await pending;
  }
  // The curated fallback is a hand-written handful, not a pool to select from.
  if (!cache.length) return CURATED.slice(0, limit);
  return selectForSport(cache, limit, sport);
}

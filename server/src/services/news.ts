// Curated sports-news source for the feed's right-rail news module.
//
// EDITORIAL CONTROL, BY DESIGN: this rail renders next to minors' profiles, so
// what appears here must be decided by us — never an open third-party feed that
// could surface arbitrary (or inappropriate) headlines and imagery. The source
// of truth is therefore this hand-curated, allow-listed list: everything shown
// is reviewed before it ships. Keep it to reputable outlets and grassroots /
// Indian-sport coverage. (Upgrade path if freshness ever demands it: pull RSS
// from an allow-list of these same outlets into a moderation queue, and publish
// only admin-approved items — same shape, so the rail/endpoint don't change.)

export interface NewsItem {
  id: string;
  title: string;
  source: string;   // publication name (shown as attribution)
  url: string;      // opens in a new tab
  category: string; // short tag, e.g. "Grassroots"
}

// Curated entries. Replace/extend as the editorial team sees fit — this array is
// the whole allow-list. Links point at established outlets' sport sections.
const CURATED: NewsItem[] = [
  {
    id: 'bridge-grassroots',
    title: 'Grassroots watch: the academies quietly building India’s next generation',
    source: 'The Bridge',
    url: 'https://thebridge.in/grassroots-sports/',
    category: 'Grassroots',
  },
  {
    id: 'field-football',
    title: 'Inside India’s youth football pipeline and the state leagues feeding it',
    source: 'Scroll · The Field',
    url: 'https://scroll.in/field',
    category: 'Football',
  },
  {
    id: 'sportstar-schools',
    title: 'School and junior nationals: results, breakout names and what’s next',
    source: 'Sportstar',
    url: 'https://sportstar.thehindu.com/',
    category: 'Youth',
  },
  {
    id: 'olympics-india',
    title: 'India at the Olympics: pathway athletes and development updates',
    source: 'Olympics.com',
    url: 'https://olympics.com/en/news/india',
    category: 'Pathway',
  },
  {
    id: 'bridge-basketball',
    title: 'Indian basketball’s grassroots surge — leagues, courts and talent',
    source: 'The Bridge',
    url: 'https://thebridge.in/basketball/',
    category: 'Basketball',
  },
];

/** The curated news items shown in the rail. Kept as a function (not the bare
 *  array) so a future DB/RSS-backed source is a drop-in with no caller change. */
export function getCuratedNews(limit = 5): NewsItem[] {
  return CURATED.slice(0, limit);
}

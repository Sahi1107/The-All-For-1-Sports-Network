import { useState, useRef, useEffect } from 'react';
import Avatar from '../components/Avatar';
import BallLoader from '../components/BallLoader';
import { VerifiedTick } from '../components/feed/FeedBits';
import ConnectButton from '../components/ConnectButton';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { track } from '../config/analytics';
import { Search, MapPin, User, Zap, ChevronRight, Loader2, Clock, MessageSquareText, SlidersHorizontal, BadgeCheck } from 'lucide-react';
import api from '../api/client';
import EmptyState from '../components/EmptyState';
import toast from 'react-hot-toast';

const SPORT_EMOJI: Record<string, string> = {
  BASKETBALL: '🏀',
  FOOTBALL: '⚽',
  CRICKET: '🏏',
};

// Labels for nearest-location widening (city → state → region → country).
const TIER_LABEL: Record<string, string> = {
  state: 'same state',
  region: 'same region',
  country: 'elsewhere in India',
};

// Short, scannable chip labels that expand to a full natural-language query — a
// flagship search should invite a tap, not present a wall of quoted sentences.
const EXAMPLES: { chip: string; emoji: string; query: string }[] = [
  { chip: 'Left-footed strikers, U19', emoji: '⚽', query: 'Show me left-footed strikers under 19 in Maharashtra with 10+ goals' },
  { chip: 'Delhi point guards, 20–25', emoji: '🏀', query: 'Find basketball point guards in Delhi between ages 20–25' },
  { chip: 'TN fast bowlers, 20+ wickets', emoji: '🏏', query: 'Cricket fast bowlers in Tamil Nadu with 20+ wickets' },
  { chip: 'Goa keepers, under 22', emoji: '⚽', query: 'Football goalkeepers under 22 in Goa' },
  { chip: 'Karnataka forwards, 15+ pts', emoji: '🏀', query: 'Basketball forwards in Karnataka with 15+ points' },
];

// One-tap starters by sport — the fastest way in for someone who just wants to browse.
const SPORT_STARTERS: { label: string; emoji: string; query: string }[] = [
  { label: 'Basketball', emoji: '🏀', query: 'basketball players' },
  { label: 'Football', emoji: '⚽', query: 'football players' },
  { label: 'Cricket', emoji: '🏏', query: 'cricket players' },
];

const HOW_IT_WORKS: { icon: typeof MessageSquareText; title: string; body: string }[] = [
  { icon: MessageSquareText, title: 'Describe who you want', body: 'Type it in plain English — sport, position, age, location, stats. No filters to fiddle with.' },
  { icon: SlidersHorizontal, title: 'Radar reads the query', body: 'It parses your words into precise criteria and finds the athletes that fit — widening only if it must.' },
  { icon: BadgeCheck, title: 'Get verified matches', body: 'Every result is a real athlete with performance recorded at All For 1 tournaments — not self-reported.' },
];

// ── Recent searches (per-device, localStorage) ──────────────────────────────
const RECENT_KEY = 'af1:radar-recent';
const RECENT_MAX = 6;
function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function pushRecent(q: string, prev: string[]): string[] {
  const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

function FilterTag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 border border-primary/20 text-primary-light">
      <span className="text-foreground/40">{label}</span>
      {value}
    </span>
  );
}

function AthleteCard({ athlete }: { athlete: any }) {
  const locationParts = (athlete.location || '').split(',').map((p: string) => p.trim());

  const statEntries = athlete.stats
    ? Object.entries(athlete.stats as Record<string, number>)
    : [];

  return (
    <Link
      to={`/profile/${athlete.id}`}
      className="group relative flex items-start gap-4 p-4 bg-ink/5 hover:bg-ink/[0.08] border border-ink/10 hover:border-primary/40 rounded-xl transition-all hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Avatar + rank badge (when the athlete is ranked in their category) */}
      <div className="relative shrink-0">
        <Avatar name={athlete.name} src={athlete.avatar} size={48} />
        {athlete.rank != null && athlete.rank <= 999 && (
          <span className="absolute -bottom-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-primary text-on-primary text-[10px] font-numeric font-bold tabular-nums flex items-center justify-center ring-2 ring-surface">
            #{athlete.rank}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 min-w-0">
            <p className="font-semibold truncate group-hover:text-primary-light transition-colors">
              {athlete.name}
            </p>
            {athlete.verified && <VerifiedTick size={14} />}
          </span>
          <span className="shrink-0 flex items-center gap-2">
            <ConnectButton userId={athlete.id} status={athlete.connectionStatus} />
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-foreground/30 group-hover:text-primary transition-colors">
              View <ChevronRight size={13} />
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-foreground/50">
          <span>{SPORT_EMOJI[athlete.sport]} {athlete.sport?.toLowerCase()}</span>
          {athlete.position && (
            <>
              <span>·</span>
              <span className="text-foreground/70 capitalize">{athlete.position}</span>
            </>
          )}
          {athlete.age && (
            <>
              <span>·</span>
              <span>{athlete.age} yrs</span>
            </>
          )}
          {athlete.height && (
            <>
              <span>·</span>
              <span>{athlete.height}</span>
            </>
          )}
        </div>

        {athlete.location && (
          <p className="flex items-center gap-1 mt-1 text-xs text-foreground/40">
            <MapPin size={10} />
            {locationParts.join(', ')}
            {athlete.approximate && (
              <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400">
                ≈ {TIER_LABEL[athlete.matchTier] ?? 'approximate'}
              </span>
            )}
          </p>
        )}

        {/* Aggregated stats — verified, as compact stat pills */}
        {statEntries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {statEntries.map(([key, val]) => (
              <span key={key} className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/15">
                <span className="text-xs font-numeric font-bold tabular-nums text-primary-light">{val}</span>
                <span className="text-[10px] text-foreground/50 capitalize">{key}</span>
              </span>
            ))}
          </div>
        )}

        {/* Bio snippet */}
        {athlete.bio && (
          <p className="mt-1.5 text-xs text-foreground/40 line-clamp-1 leading-relaxed">
            {athlete.bio}
          </p>
        )}
      </div>
    </Link>
  );
}

function FilterSummary({ filters }: { filters: Record<string, any> }) {
  const tags: { label: string; value: string }[] = [];

  if (filters.sport) tags.push({ label: 'sport:', value: filters.sport.toLowerCase() });
  if (filters.role && filters.role !== 'ATHLETE') tags.push({ label: 'role:', value: filters.role.toLowerCase() });
  if (filters.position) tags.push({ label: 'position:', value: filters.position });
  if (filters.minAge && filters.maxAge) tags.push({ label: 'age:', value: `${filters.minAge}–${filters.maxAge}` });
  else if (filters.maxAge) tags.push({ label: 'under:', value: String(filters.maxAge + 1) });
  else if (filters.minAge) tags.push({ label: 'over:', value: String(filters.minAge) });
  if (filters.state) tags.push({ label: 'state:', value: filters.state });
  if (filters.city) tags.push({ label: 'city:', value: filters.city });
  if (filters.minGoals) tags.push({ label: 'goals ≥', value: String(filters.minGoals) });
  if (filters.minAssists) tags.push({ label: 'assists ≥', value: String(filters.minAssists) });
  if (filters.minPoints) tags.push({ label: 'points ≥', value: String(filters.minPoints) });
  if (filters.minRebounds) tags.push({ label: 'rebounds ≥', value: String(filters.minRebounds) });
  if (filters.minRuns) tags.push({ label: 'runs ≥', value: String(filters.minRuns) });
  if (filters.minWickets) tags.push({ label: 'wickets ≥', value: String(filters.minWickets) });

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t, i) => (
        <FilterTag key={i} label={t.label} value={t.value} />
      ))}
    </div>
  );
}

// Athlete quotes shown under the ball while a Radar search runs (Radar only —
// the shared BallLoader stays text-free). Verified, fixed list.
const RADAR_QUOTES: ReadonlyArray<{ text: string; author: string }> = [
  { text: 'Talent without working hard is nothing.', author: 'Cristiano Ronaldo' },
  { text: 'You have to fight to reach your dream. You have to sacrifice and work hard for it.', author: 'Lionel Messi' },
  { text: 'The day you think there is no improvement to be made is a sad one.', author: 'Lionel Messi' },
  { text: 'Self-belief and hard work will always earn you success.', author: 'Virat Kohli' },
  { text: "If you remain humble, people will give you love and respect even after you've finished with the game.", author: 'Sachin Tendulkar' },
  { text: "Chase your dreams, but make sure you don't find shortcuts.", author: 'Sachin Tendulkar' },
  { text: "I don't want any shortcuts. I want my sport to become popular with my hard work and effort.", author: 'Neeraj Chopra' },
  { text: "I've missed more than 9,000 shots in my career. I've lost almost 300 games. And that is why I succeed.", author: 'Michael Jordan' },
  { text: 'Talent wins games, but teamwork and intelligence win championships.', author: 'Michael Jordan' },
  { text: "In the end, it's the effort that matters. The rest is beyond your control.", author: 'Maria Sharapova' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { text: 'The ideal attitude is to be physically loose but mentally tight.', author: 'Arthur Ashe' },
  { text: 'Skill is only developed by hours and hours of work.', author: 'Usain Bolt' },
  { text: 'Each day I work on getting better, and even the bad days have something good that comes out of them.', author: 'Katie Ledecky' },
  { text: 'There is something about seeing myself improve that motivates and excites me.', author: 'Jackie Joyner-Kersee' },
  { text: "The only one who can tell you 'you can't win' is you, and you don't have to listen.", author: 'Jessica Ennis-Hill' },
  { text: 'We can push ourselves further. We always have more to give.', author: 'Simone Biles' },
  { text: 'Everything is possible as long as you put your mind to it.', author: 'Michael Phelps' },
  { text: "You miss 100% of the shots you don't take.", author: 'Wayne Gretzky' },
  { text: 'Suffer now and live the rest of your life as a champion.', author: 'Muhammad Ali' },
  { text: "There may be people that have more talent than you, but there's no excuse for anyone to work harder than you do.", author: 'Derek Jeter' },
  { text: 'Every legend started at the grassroots.', author: 'All For 1' },
  { text: 'The next star is training right now.', author: 'All For 1' },
  { text: 'Make your game impossible to ignore.', author: 'All For 1' },
];

/** Radar loading: bouncing ball + a randomly-rotating athlete quote. */
function RadarLoadingQuote() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * RADAR_QUOTES.length));
  useEffect(() => {
    const id = setInterval(() => {
      setIdx((cur) => {
        if (RADAR_QUOTES.length < 2) return cur;
        let n = cur;
        while (n === cur) n = Math.floor(Math.random() * RADAR_QUOTES.length);
        return n;
      });
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const q = RADAR_QUOTES[idx];
  return (
    <div className="flex flex-col items-center gap-4 py-12" role="status" aria-live="polite">
      <BallLoader size="lg" />
      <figure className="max-w-md px-4 text-center">
        <blockquote className="text-sm italic leading-relaxed text-foreground/70">“{q.text}”</blockquote>
        <figcaption className="mt-2 text-xs font-semibold text-primary-light">— {q.author}</figcaption>
      </figure>
    </div>
  );
}

export default function Radar() {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (q: string) => {
      const { data } = await api.post('/radar', { query: q });
      return data;
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Search failed');
    },
  });

  const handleSubmit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    track('radar_search');
    setQuery(trimmed);
    setRecent((prev) => pushRecent(trimmed, prev));
    mutation.mutate(trimmed);
  };

  const clearRecent = () => {
    try { localStorage.removeItem(RECENT_KEY); } catch { /* noop */ }
    setRecent([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit(query);
  };

  const showLanding = !mutation.data && !mutation.isPending;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header — flagship framing so a recruiter gets it at a glance */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.10] via-ink/[0.04] to-transparent px-5 py-5 sm:px-7 sm:py-6">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary">
              <Zap size={17} />
            </span>
            <h1 className="text-2xl font-display font-bold tracking-tight">Radar</h1>
          </div>
          <p className="text-sm sm:text-[15px] text-foreground/60 max-w-xl leading-relaxed">
            Scout any athlete in plain English. Describe who you&apos;re looking for — sport, position,
            age, location, stats — and Radar returns <span className="text-foreground/80 font-medium">verified</span> matches.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search
          size={17}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30 pointer-events-none"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. left-footed strikers under 19 in Maharashtra with 10+ goals"
          className="w-full pl-11 pr-32 py-3.5 bg-ink/5 border border-ink/10 focus:border-primary focus:ring-2 focus:ring-primary/15 rounded-xl text-sm text-foreground placeholder-ink/25 focus:outline-none transition-all"
          maxLength={500}
          autoFocus
        />
        <button
          onClick={() => handleSubmit(query)}
          disabled={mutation.isPending || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary hover:bg-primary-dark disabled:bg-primary/30 text-on-primary font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
        >
          {mutation.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Search size={13} />
          )}
          Search
        </button>
      </div>

      {/* ── Pre-search landing: recent, examples, starters, how-it-works ── */}
      {showLanding && (
        <div className="space-y-7">
          {/* Recent searches */}
          {recent.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-foreground/35 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={12} /> Recent
                </p>
                <button onClick={clearRecent} className="text-[11px] text-foreground/30 hover:text-foreground/60 transition-colors">Clear</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleSubmit(r)}
                    className="group inline-flex items-center gap-1.5 max-w-full pl-3 pr-2.5 py-1.5 rounded-full bg-ink/5 hover:bg-ink/[0.09] border border-ink/10 hover:border-primary/30 text-xs text-foreground/70 transition-colors"
                  >
                    <Clock size={11} className="shrink-0 text-foreground/30" />
                    <span className="truncate max-w-[240px]">{r}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Example chips */}
          <div className="space-y-2.5">
            <p className="text-[11px] text-foreground/35 font-semibold uppercase tracking-wider">Try a search</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.chip}
                  onClick={() => handleSubmit(ex.query)}
                  title={ex.query}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/[0.07] hover:bg-primary/[0.14] border border-primary/20 hover:border-primary/40 text-xs font-medium text-foreground/80 hover:text-foreground transition-colors"
                >
                  <span aria-hidden>{ex.emoji}</span>
                  {ex.chip}
                </button>
              ))}
            </div>
          </div>

          {/* Browse by sport — one-tap starters */}
          <div className="space-y-2.5">
            <p className="text-[11px] text-foreground/35 font-semibold uppercase tracking-wider">Browse by sport</p>
            <div className="grid grid-cols-3 gap-2.5">
              {SPORT_STARTERS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => handleSubmit(s.query)}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-ink/5 hover:bg-ink/[0.09] border border-ink/10 hover:border-primary/30 transition-colors"
                >
                  <span className="text-xl" aria-hidden>{s.emoji}</span>
                  <span className="text-sm font-semibold">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* How Radar works — fills the below-the-fold space with something that
              teaches a first-time recruiter what the tool actually does. */}
          <div className="space-y-3 pt-1">
            <p className="text-[11px] text-foreground/35 font-semibold uppercase tracking-wider">How Radar works</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {HOW_IT_WORKS.map((step, i) => (
                <div key={step.title} className="relative rounded-xl border border-ink/10 bg-ink/[0.03] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/12 text-primary">
                      <step.icon size={15} />
                    </span>
                    <span className="font-numeric text-xs font-bold text-foreground/25 tabular-nums">0{i + 1}</span>
                  </div>
                  <p className="text-sm font-semibold mb-1">{step.title}</p>
                  <p className="text-xs text-foreground/50 leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading state — bouncing ball + rotating athlete quote (Radar only) */}
      {mutation.isPending && <RadarLoadingQuote />}

      {/* Results */}
      {mutation.data && !mutation.isPending && (
        <div className="space-y-4">
          {/* Filter summary + count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-foreground/50">
                <span className="text-foreground font-semibold">{mutation.data.total}</span> result{mutation.data.total !== 1 ? 's' : ''} found
              </p>
              <button
                onClick={() => {
                  mutation.reset();
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="text-xs text-foreground/30 hover:text-foreground/60 transition-colors"
              >
                Clear
              </button>
            </div>
            {mutation.data.filters && <FilterSummary filters={mutation.data.filters} />}
            {mutation.data.widened && (
              <div className="text-xs text-amber-400/90 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                Not enough exact matches — showing the nearest available players
                {mutation.data.widened.widestTier && <> (widened to {TIER_LABEL[mutation.data.widened.widestTier] ?? mutation.data.widened.widestTier})</>}.
              </div>
            )}
            {mutation.data.relaxed?.length > 0 && (
              <div className="text-xs text-amber-400/90 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                No exact matches — showing the closest{' '}
                {mutation.data.filters?.sport ? `${mutation.data.filters.sport.toLowerCase()} ` : ''}
                players (relaxed: {mutation.data.relaxed.join(', ')}).
              </div>
            )}
          </div>

          {/* Athlete list */}
          {mutation.data.results.length === 0 ? (
            <EmptyState
              icon={User}
              title={
                mutation.data.emptyReason === 'no-athletes-in-sport' && mutation.data.filters?.sport
                  ? `No ${mutation.data.filters.sport.toLowerCase()} athletes on All For 1 yet`
                  : 'No athletes found'
              }
              hint={
                mutation.data.emptyReason === 'no-athletes-in-sport'
                  ? 'As more athletes join, they’ll appear here.'
                  : 'Try broader criteria or a different location.'
              }
            />
          ) : (
            <div className="space-y-2">
              {mutation.data.results.map((athlete: any) => (
                <AthleteCard key={athlete.id} athlete={athlete} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

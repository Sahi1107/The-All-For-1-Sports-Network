import { useState, useRef, useEffect } from 'react';
import BallLoader from '../components/BallLoader';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Search, MapPin, User, Zap, ChevronRight, Loader2 } from 'lucide-react';
import api from '../api/client';
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

const EXAMPLE_QUERIES = [
  'Show me left-footed strikers under 19 in Maharashtra with 10+ goals',
  'Find basketball point guards in Delhi between ages 20–25',
  'Cricket fast bowlers in Tamil Nadu with 20+ wickets',
  'Football goalkeepers under 22 in Goa',
  'Basketball forwards in Karnataka with 15+ points',
];

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
      className="group flex items-start gap-4 p-4 bg-ink/5 hover:bg-ink/8 border border-ink/10 hover:border-primary/30 rounded-xl transition-all"
    >
      {/* Avatar */}
      <div className="shrink-0">
        {athlete.avatar ? (
          <img
            src={athlete.avatar}
            alt={athlete.name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary-light">
            {athlete.name?.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold truncate group-hover:text-primary-light transition-colors">
            {athlete.name}
          </p>
          <ChevronRight size={14} className="shrink-0 text-foreground/30 group-hover:text-primary transition-colors" />
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

        {/* Aggregated stats */}
        {statEntries.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-2">
            {statEntries.map(([key, val]) => (
              <div key={key} className="text-center">
                <p className="text-sm font-bold text-primary-light">{val}</p>
                <p className="text-[10px] text-foreground/40 capitalize">{key}</p>
              </div>
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
    setQuery(trimmed);
    mutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit(query);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Zap size={18} className="text-primary" />
          <h1 className="text-xl font-bold">Radar</h1>
        </div>
        <p className="text-sm text-foreground/50">
          Search athletes in plain English. Ask anything about sport, position, age, location, or stats.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/30 pointer-events-none"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. left-footed strikers under 19 in Maharashtra with 10+ goals"
          className="w-full pl-9 pr-28 py-3 bg-ink/5 border border-ink/10 focus:border-primary rounded-xl text-sm text-foreground placeholder-ink/25 focus:outline-none transition-colors"
          maxLength={500}
          autoFocus
        />
        <button
          onClick={() => handleSubmit(query)}
          disabled={mutation.isPending || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-primary hover:bg-primary-dark disabled:bg-primary/30 text-on-primary font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
        >
          {mutation.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Search size={13} />
          )}
          Search
        </button>
      </div>

      {/* Example queries — shown before first search */}
      {!mutation.data && !mutation.isPending && (
        <div className="space-y-2">
          <p className="text-xs text-foreground/30 font-medium uppercase tracking-wide">Try asking</p>
          <div className="space-y-1.5">
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setQuery(ex);
                  handleSubmit(ex);
                }}
                className="w-full text-left text-sm text-foreground/50 hover:text-foreground px-3 py-2 rounded-lg hover:bg-ink/5 transition-colors border border-transparent hover:border-ink/10"
              >
                "{ex}"
              </button>
            ))}
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
            <div className="py-12 text-center">
              <User size={32} className="text-foreground/10 mx-auto mb-3" />
              <p className="text-foreground/40 text-sm">
                {mutation.data.emptyReason === 'no-athletes-in-sport' && mutation.data.filters?.sport
                  ? `No ${mutation.data.filters.sport.toLowerCase()} athletes on All For 1 yet.`
                  : 'No athletes found.'}
              </p>
              <p className="text-foreground/25 text-xs mt-1">
                {mutation.data.emptyReason === 'no-athletes-in-sport'
                  ? 'As more athletes join, they’ll appear here.'
                  : 'Try broader criteria or a different location.'}
              </p>
            </div>
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

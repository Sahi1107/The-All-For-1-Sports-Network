import { useState, useRef } from 'react';
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
      <span className="text-white/40">{label}</span>
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
      className="group flex items-start gap-4 p-4 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-primary/30 rounded-xl transition-all"
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
          <ChevronRight size={14} className="shrink-0 text-white/30 group-hover:text-primary transition-colors" />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/50">
          <span>{SPORT_EMOJI[athlete.sport]} {athlete.sport?.toLowerCase()}</span>
          {athlete.position && (
            <>
              <span>·</span>
              <span className="text-white/70 capitalize">{athlete.position}</span>
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
          <p className="flex items-center gap-1 mt-1 text-xs text-white/40">
            <MapPin size={10} />
            {locationParts.join(', ')}
          </p>
        )}

        {/* Aggregated stats */}
        {statEntries.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-2">
            {statEntries.map(([key, val]) => (
              <div key={key} className="text-center">
                <p className="text-sm font-bold text-primary-light">{val}</p>
                <p className="text-[10px] text-white/40 capitalize">{key}</p>
              </div>
            ))}
          </div>
        )}

        {/* Bio snippet */}
        {athlete.bio && (
          <p className="mt-1.5 text-xs text-white/40 line-clamp-1 leading-relaxed">
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

export default function ScoutCopilot() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (q: string) => {
      const { data } = await api.post('/scout-copilot', { query: q });
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
          <h1 className="text-xl font-bold">Scout Copilot</h1>
        </div>
        <p className="text-sm text-white/50">
          Search athletes in plain English. Ask anything about sport, position, age, location, or stats.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. left-footed strikers under 19 in Maharashtra with 10+ goals"
          className="w-full pl-9 pr-28 py-3 bg-white/5 border border-white/10 focus:border-primary rounded-xl text-sm text-white placeholder-white/25 focus:outline-none transition-colors"
          maxLength={500}
          autoFocus
        />
        <button
          onClick={() => handleSubmit(query)}
          disabled={mutation.isPending || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-primary hover:bg-primary-dark disabled:bg-primary/30 text-dark font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
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
          <p className="text-xs text-white/30 font-medium uppercase tracking-wide">Try asking</p>
          <div className="space-y-1.5">
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setQuery(ex);
                  handleSubmit(ex);
                }}
                className="w-full text-left text-sm text-white/50 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
              >
                "{ex}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {mutation.isPending && (
        <div className="flex items-center gap-3 py-8 justify-center text-white/40 text-sm">
          <Loader2 size={18} className="animate-spin" />
          Analysing query and searching…
        </div>
      )}

      {/* Results */}
      {mutation.data && !mutation.isPending && (
        <div className="space-y-4">
          {/* Filter summary + count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/50">
                <span className="text-white font-semibold">{mutation.data.total}</span> result{mutation.data.total !== 1 ? 's' : ''} found
              </p>
              <button
                onClick={() => {
                  mutation.reset();
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Clear
              </button>
            </div>
            {mutation.data.filters && <FilterSummary filters={mutation.data.filters} />}
          </div>

          {/* Athlete list */}
          {mutation.data.results.length === 0 ? (
            <div className="py-12 text-center">
              <User size={32} className="text-white/10 mx-auto mb-3" />
              <p className="text-white/40 text-sm">No athletes matched your search.</p>
              <p className="text-white/25 text-xs mt-1">Try broader criteria or a different location.</p>
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

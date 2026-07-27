import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Search, X, Clock, WifiOff, AlertCircle, Users, Shield, Trophy,
} from 'lucide-react';
import api from '../api/client';
import { track } from '../config/analytics';
import { VerifiedTick } from './feed/FeedBits';
import { useDebounce } from '../hooks/useDebounce';

// ── Result shapes (mirror GET /api/search) ───────────────────────────────────
interface Athlete { id: string; name: string; role: string; sport: string | null; position: string | null; state: string | null; avatar: string | null; verified: boolean; }
interface Team { id: string; name: string; sport: string | null; logo: string | null; tournament: { name: string } | null; }
interface Tournament { id: string; name: string; sport: string | null; city: string | null; startDate: string; endDate: string; status: string; thumbnailUrl: string | null; }
interface SearchResponse { query: string; athletes: Athlete[]; teams: Team[]; tournaments: Tournament[]; }

type Kind = 'athlete' | 'team' | 'tournament';
interface FlatItem { kind: Kind; id: string; to: string; }

// ── Recent searches (selected entities), persisted per device ────────────────
interface RecentItem { kind: Kind; id: string; to: string; label: string; sub: string; avatar?: string | null; verified?: boolean; }
const RECENTS_KEY = 'af1:recent-searches';
const RECENTS_MAX = 6;

function loadRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, RECENTS_MAX) : [];
  } catch { return []; }
}
function saveRecents(items: RecentItem[]) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, RECENTS_MAX))); } catch { /* quota / private mode */ }
}

const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');
const dateRange = (a: string, b: string) => {
  const f = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(a)} – ${f(b)}`;
};

/**
 * Feed search upgraded to a live typeahead: debounced suggestions across
 * People / Teams / Tournaments in a grouped dropdown, keyboard + touch nav,
 * recent searches, and deliberate loading / empty / no-results / error /
 * offline states. Selecting a suggestion navigates straight to the entity;
 * Enter with nothing highlighted goes to the full results page.
 */
export default function SearchTypeahead({ className = '', autoFocus = false, onNavigate }: { className?: string; autoFocus?: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);          // highlighted flat index (-1 = none)
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  const dq = useDebounce(q.trim(), 250);
  const enabled = dq.length >= 2 && online;

  useEffect(() => { setRecents(loadRecents()); }, []);
  // When embedded in the global-search overlay, focus + open on mount.
  useEffect(() => { if (autoFocus) { inputRef.current?.focus(); setOpen(true); } }, [autoFocus]);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Close on outside click (mousedown so it beats focus changes).
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const { data, isFetching, isError, refetch } = useQuery<SearchResponse>({
    queryKey: ['search', dq],
    queryFn: async ({ signal }) => {
      // react-query aborts this signal when the key changes → stale in-flight
      // keystroke requests are cancelled automatically.
      const { data } = await api.get('/search', { params: { q: dq }, signal });
      return data;
    },
    enabled,
    staleTime: 60_000,             // identical queries within a minute are instant
    placeholderData: keepPreviousData, // keep old rows visible while the next load runs
  });

  const athletes = data?.athletes ?? [];
  const teams = data?.teams ?? [];
  const tournaments = data?.tournaments ?? [];
  const total = athletes.length + teams.length + tournaments.length;
  const showResults = enabled && data?.query.trim() === dq;
  const isSearching = enabled && (isFetching || dq !== data?.query.trim());

  // Flatten (in display order) for arrow-key navigation. Depends on the stable
  // react-query `data` object, not the per-render `?? []` arrays.
  const flat: FlatItem[] = useMemo(() => [
    ...(data?.athletes ?? []).map((a): FlatItem => ({ kind: 'athlete', id: a.id, to: `/profile/${a.id}` })),
    ...(data?.teams ?? []).map((t): FlatItem => ({ kind: 'team', id: t.id, to: `/teams/${t.id}` })),
    ...(data?.tournaments ?? []).map((t): FlatItem => ({ kind: 'tournament', id: t.id, to: `/tournaments/${t.id}` })),
  ], [data]);

  // Reset highlight whenever the result set changes.
  useEffect(() => { setActive(-1); }, [dq, total]);

  // Fire a PostHog event once per settled result set.
  useEffect(() => {
    if (showResults) track('search_performed', { length: dq.length, athletes: athletes.length, teams: teams.length, tournaments: tournaments.length, total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResults, dq, total]);

  const pushRecent = useCallback((r: RecentItem) => {
    setRecents((prev) => {
      const next = [r, ...prev.filter((x) => !(x.kind === r.kind && x.id === r.id))].slice(0, RECENTS_MAX);
      saveRecents(next);
      return next;
    });
  }, []);

  const go = useCallback((to: string) => { setOpen(false); inputRef.current?.blur(); onNavigate?.(); navigate(to); }, [navigate, onNavigate]);

  const selectAthlete = (a: Athlete) => { track('search_result_selected', { kind: 'athlete' }); pushRecent({ kind: 'athlete', id: a.id, to: `/profile/${a.id}`, label: a.name, sub: [cap(a.role), cap(a.sport ?? '')].filter(Boolean).join(' · '), avatar: a.avatar, verified: a.verified }); go(`/profile/${a.id}`); };
  const selectTeam = (t: Team) => { track('search_result_selected', { kind: 'team' }); pushRecent({ kind: 'team', id: t.id, to: `/teams/${t.id}`, label: t.name, sub: cap(t.sport ?? ''), avatar: t.logo }); go(`/teams/${t.id}`); };
  const selectTournament = (t: Tournament) => { track('search_result_selected', { kind: 'tournament' }); pushRecent({ kind: 'tournament', id: t.id, to: `/tournaments/${t.id}`, label: t.name, sub: cap(t.sport ?? ''), avatar: t.thumbnailUrl }); go(`/tournaments/${t.id}`); };

  const selectFlat = (i: number) => {
    const item = flat[i]; if (!item) return;
    if (item.kind === 'athlete') selectAthlete(athletes.find((a) => a.id === item.id)!);
    else if (item.kind === 'team') selectTeam(teams.find((t) => t.id === item.id)!);
    else selectTournament(tournaments.find((t) => t.id === item.id)!);
  };

  const goToFullResults = () => {
    const term = q.trim(); if (!term) return;
    track('search_submitted', { length: term.length });
    go(`/explore?search=${encodeURIComponent(term)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && active < flat.length) selectFlat(active);
      else goToFullResults();
      return;
    }
    if (!flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((i) => (i <= 0 ? flat.length - 1 : i - 1)); }
  };

  // Keep the highlighted row in view.
  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const clearInput = () => { setQ(''); setActive(-1); inputRef.current?.focus(); };
  const clearRecents = () => { setRecents([]); saveRecents([]); };

  // Avatar / crest / logo with monogram fallback.
  const Thumb = ({ src, name, rounded }: { src?: string | null; name: string; rounded: string }) =>
    src
      ? <img src={src} alt="" className={`w-9 h-9 ${rounded} object-cover shrink-0`} />
      : <div className={`w-9 h-9 ${rounded} bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0`}>{name.charAt(0).toUpperCase()}</div>;

  const GroupHeader = ({ icon: Icon, label }: { icon: typeof Users; label: string }) => (
    <div className="flex items-center gap-1.5 px-3 pt-3 pb-1 text-[11px] font-display font-bold uppercase tracking-wider text-gray-custom">
      <Icon size={12} /> {label}
    </div>
  );

  // A selectable row; `idx` is its position in the flat list (for keyboard sync).
  const Row = ({ idx, thumb, title, sub, verified, onSelect }: { idx: number; thumb: React.ReactNode; title: string; sub: string; verified?: boolean; onSelect: () => void; }) => (
    <button
      type="button"
      data-idx={idx}
      // preventDefault on mousedown keeps input focus so the click always lands
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      onMouseEnter={idx >= 0 ? () => setActive(idx) : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx >= 0 && active === idx ? 'bg-ink/10' : 'hover:bg-ink/5'}`}
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 min-w-0">
          <span className="font-semibold text-sm truncate">{title}</span>
          {verified && <VerifiedTick size={14} />}
        </span>
        {sub && <span className="block text-xs text-gray-custom truncate capitalize">{sub}</span>}
      </span>
    </button>
  );

  const showRecents = open && dq.length < 2 && online && recents.length > 0;
  const showHint = open && dq.length < 2 && online && recents.length === 0;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Input pill (matches the app's rounded search field) */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-ink/5 border border-ink/10 focus-within:border-primary/50 transition-colors">
        <Search size={16} className="text-gray-custom shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search athletes, teams, tournaments..."
          className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder-gray-custom focus:outline-none"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
        />
        {q && (
          <button type="button" onClick={clearInput} aria-label="Clear search" className="text-gray-custom hover:text-foreground transition-colors shrink-0">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-2 rounded-2xl bg-surface border border-ink/10 shadow-xl overflow-hidden"
        >
          <div ref={listRef} className="max-h-[min(70vh,26rem)] overflow-y-auto overscroll-contain">
            {/* Offline */}
            {!online ? (
              <State icon={WifiOff} title="You're offline" sub="Check your connection and try again." />
            ) : showRecents ? (
              <>
                <div className="flex items-center justify-between px-3 pt-3 pb-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-display font-bold uppercase tracking-wider text-gray-custom"><Clock size={12} /> Recent</span>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={clearRecents} className="text-[11px] text-gray-custom hover:text-foreground transition-colors">Clear</button>
                </div>
                <div className="pb-1">
                  {recents.map((r) => (
                    <Row key={`${r.kind}-${r.id}`} idx={-1}
                      thumb={<Thumb src={r.avatar} name={r.label} rounded={r.kind === 'athlete' ? 'rounded-full' : 'rounded-lg'} />}
                      title={r.label} sub={r.sub} verified={r.verified}
                      onSelect={() => go(r.to)} />
                  ))}
                </div>
              </>
            ) : showHint ? (
              <State icon={Search} title="Search All For 1" sub="Find athletes, teams and tournaments." />
            ) : isError ? (
              <div className="px-4 py-8 text-center">
                <AlertCircle size={22} className="mx-auto text-gray-custom mb-2" />
                <p className="text-sm text-foreground">Couldn't search</p>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => refetch()} className="mt-2 text-xs font-semibold text-primary hover:underline">Try again</button>
              </div>
            ) : showResults && total === 0 && !isSearching ? (
              <State icon={Search} title={`No results for "${dq}"`} sub="Try a different name or spelling." />
            ) : total === 0 && isSearching ? (
              <Loading />
            ) : (
              <>
                {athletes.length > 0 && (
                  <>
                    <GroupHeader icon={Users} label="Athletes & People" />
                    {athletes.map((a) => {
                      const idx = flat.findIndex((f) => f.kind === 'athlete' && f.id === a.id);
                      return <Row key={a.id} idx={idx}
                        thumb={<Thumb src={a.avatar} name={a.name} rounded="rounded-full" />}
                        title={a.name} verified={a.verified}
                        sub={[cap(a.role), cap(a.sport ?? ''), a.position, a.state].filter(Boolean).join(' · ')}
                        onSelect={() => selectAthlete(a)} />;
                    })}
                  </>
                )}
                {teams.length > 0 && (
                  <>
                    <GroupHeader icon={Shield} label="Teams" />
                    {teams.map((t) => {
                      const idx = flat.findIndex((f) => f.kind === 'team' && f.id === t.id);
                      return <Row key={t.id} idx={idx}
                        thumb={<Thumb src={t.logo} name={t.name} rounded="rounded-lg" />}
                        title={t.name}
                        sub={[cap(t.sport ?? ''), t.tournament?.name].filter(Boolean).join(' · ')}
                        onSelect={() => selectTeam(t)} />;
                    })}
                  </>
                )}
                {tournaments.length > 0 && (
                  <>
                    <GroupHeader icon={Trophy} label="Tournaments" />
                    {tournaments.map((t) => {
                      const idx = flat.findIndex((f) => f.kind === 'tournament' && f.id === t.id);
                      return <Row key={t.id} idx={idx}
                        thumb={<Thumb src={t.thumbnailUrl} name={t.name} rounded="rounded-lg" />}
                        title={t.name}
                        sub={[cap(t.sport ?? ''), t.city, dateRange(t.startDate, t.endDate)].filter(Boolean).join(' · ')}
                        onSelect={() => selectTournament(t)} />;
                    })}
                  </>
                )}

                {/* Footer: jump to full results */}
                {total > 0 && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={goToFullResults}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 border-t border-ink/10 text-xs font-semibold text-primary hover:bg-ink/5 transition-colors">
                    <Search size={13} /> See all results for "{dq}"
                  </button>
                )}
                {isSearching && total > 0 && <div className="h-0.5 bg-primary/30 animate-pulse" />}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small presentational bits ────────────────────────────────────────────────
function State({ icon: Icon, title, sub }: { icon: typeof Search; title: string; sub: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <Icon size={22} className="mx-auto text-gray-custom mb-2" />
      <p className="text-sm text-foreground">{title}</p>
      <p className="text-xs text-gray-custom mt-0.5">{sub}</p>
    </div>
  );
}
function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gray-custom">
      <span className="w-4 h-4 rounded-full border-2 border-ink/20 border-t-primary animate-spin" /> Searching…
    </div>
  );
}

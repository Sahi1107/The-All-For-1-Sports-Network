import Avatar, { TeamCrest, TournamentMark } from '../components/Avatar';
import BallLoader from '../components/BallLoader';
import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, MapPin, Users, Shield, Trophy, Calendar, ChevronDown } from 'lucide-react';
import api from '../api/client';
import { VerifiedTick } from '../components/feed/FeedBits';
import PullToRefresh from '../components/PullToRefresh';
import EmptyState from '../components/EmptyState';
import { useDebounce } from '../hooks/useDebounce';
import { SPORTS as ALL_SPORTS } from '../data/sports';

type Tab = 'people' | 'teams' | 'tournaments';
const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'people', label: 'People', icon: Users },
  { key: 'teams', label: 'Teams', icon: Shield },
  { key: 'tournaments', label: 'Tournaments', icon: Trophy },
];
const ROLES = ['ALL', 'ATHLETE', 'COACH', 'SCOUT', 'AGENT'] as const;
const SPORTS = [{ value: 'ALL', label: 'All', emoji: '' }, ...ALL_SPORTS.map((s) => ({ value: s.value, label: s.label, emoji: s.emoji }))] as const;
const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');
const dateRange = (a: string, b: string) => {
  const f = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(a)} – ${f(b)}`;
};
const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== 'ALL') p.set(k, String(v));
  return p.toString();
};

export default function Explore() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'people';
  const [search, setSearch] = useState(sp.get('search') ?? '');
  const [role, setRole] = useState('ALL');
  const [sport, setSport] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [pages, setPages] = useState<Record<Tab, number>>({ people: 1, teams: 1, tournaments: 1 });

  const dq = useDebounce(search.trim(), 300);

  // Keep ?search + ?tab in the URL so results are shareable / survive refresh.
  useEffect(() => {
    const next = new URLSearchParams(sp);
    if (dq) next.set('search', dq); else next.delete('search');
    next.set('tab', tab);
    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, tab]);

  // Reset every tab to page 1 when the query or filters change.
  useEffect(() => { setPages({ people: 1, teams: 1, tournaments: 1 }); }, [dq, role, sport, status]);

  const setTab = (t: Tab) => { const next = new URLSearchParams(sp); next.set('tab', t); setSp(next); };
  const setPage = (t: Tab, p: number) => setPages((prev) => ({ ...prev, [t]: p }));

  const peopleQ = useQuery({
    queryKey: ['ex-people', dq, role, sport, pages.people],
    queryFn: async () => (await api.get(`/users?${qs({ search: dq, role, sport, page: pages.people })}`)).data,
    placeholderData: keepPreviousData,
  });
  const teamsQ = useQuery({
    queryKey: ['ex-teams', dq, sport, pages.teams],
    queryFn: async () => (await api.get(`/teams?${qs({ search: dq, sport, page: pages.teams })}`)).data,
    placeholderData: keepPreviousData,
  });
  const tournQ = useQuery({
    queryKey: ['ex-tourn', dq, sport, status, pages.tournaments],
    queryFn: async () => (await api.get(`/tournaments?${qs({ search: dq, sport, status, page: pages.tournaments })}`)).data,
    placeholderData: keepPreviousData,
  });

  const counts: Record<Tab, number | undefined> = { people: peopleQ.data?.total, teams: teamsQ.data?.total, tournaments: tournQ.data?.total };
  const active = tab === 'people' ? peopleQ : tab === 'teams' ? teamsQ : tournQ;
  const totalPages = active.data?.totalPages ?? 1;

  return (
    <PullToRefresh onRefresh={() => Promise.all([peopleQ.refetch(), teamsQ.refetch(), tournQ.refetch()])}>
    <div>
      <h1 className="text-2xl font-bold mb-5">Explore</h1>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" size={18} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search athletes, teams, tournaments..."
          className="w-full pl-10 pr-4 py-3 bg-card border border-line rounded-xl focus:outline-none focus:border-primary text-foreground"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-line">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-primary text-foreground' : 'border-transparent text-gray-custom hover:text-foreground'
            }`}
          >
            <Icon size={15} /> {label}
            {counts[key] !== undefined && (
              <span className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-primary/20 text-primary' : 'bg-elevated text-gray-custom'}`}>{counts[key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters (contextual to the active tab) */}
      <div className="flex gap-3 flex-wrap mb-6">
        {tab === 'people' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {ROLES.map((r) => (
              <button key={r} onClick={() => setRole(r)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${role === r ? 'bg-primary text-on-primary font-semibold' : 'bg-elevated text-gray-custom hover:text-foreground'}`}>
                {r === 'ALL' ? 'All roles' : cap(r)}
              </button>
            ))}
          </div>
        )}
        {/* Styled selects: appearance-none + our own chevron, so the native OS
            dropdown chrome never clashes with the pill system. */}
        <span className="relative inline-flex">
          <select value={sport} onChange={(e) => setSport(e.target.value)}
            className={`appearance-none px-3 py-1.5 pr-8 text-sm rounded-full border border-line focus:outline-none focus:border-primary cursor-pointer ${sport === 'ALL' ? 'bg-elevated text-foreground' : 'bg-secondary text-white'}`}>
            {SPORTS.map((s) => <option key={s.value} value={s.value} className="bg-card text-foreground">{s.emoji ? `${s.emoji} ${s.label}` : s.label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-custom" />
        </span>
        {tab === 'tournaments' && (
          <span className="relative inline-flex">
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className={`appearance-none px-3 py-1.5 pr-8 text-sm rounded-full border border-line focus:outline-none focus:border-primary cursor-pointer ${status === 'ALL' ? 'bg-elevated text-foreground' : 'bg-secondary text-white'}`}>
              {['ALL', 'UPCOMING', 'REGISTRATION_OPEN', 'IN_PROGRESS', 'COMPLETED'].map((s) => (
                <option key={s} value={s} className="bg-card text-foreground">{s === 'ALL' ? 'Any status' : cap(s.replace(/_/g, ' '))}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-custom" />
          </span>
        )}
      </div>

      {/* Results */}
      {active.isLoading ? (
        <div className="flex justify-center py-12"><BallLoader /></div>
      ) : active.isError ? (
        <div className="text-center py-12 text-gray-custom">
          <p>Couldn't load results.</p>
          <button onClick={() => active.refetch()} className="mt-2 text-sm font-semibold text-primary hover:underline">Try again</button>
        </div>
      ) : (
        <>
          {tab === 'people' && <PeopleGrid users={peopleQ.data?.users ?? []} query={dq} />}
          {tab === 'teams' && <TeamsGrid teams={teamsQ.data?.teams ?? []} query={dq} />}
          {tab === 'tournaments' && <TournamentsGrid tournaments={tournQ.data?.tournaments ?? []} query={dq} />}

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button onClick={() => setPage(tab, Math.max(1, pages[tab] - 1))} disabled={pages[tab] === 1}
                className="px-4 py-2 bg-elevated rounded-lg text-sm disabled:opacity-50">Previous</button>
              <span className="px-4 py-2 text-sm text-gray-custom">Page {pages[tab]} of {totalPages}</span>
              <button onClick={() => setPage(tab, pages[tab] + 1)} disabled={pages[tab] >= totalPages}
                className="px-4 py-2 bg-elevated rounded-lg text-sm disabled:opacity-50">Next</button>
            </div>
          )}
        </>
      )}
    </div>
    </PullToRefresh>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function Empty({ icon, kind, query }: { icon: typeof Users; kind: string; query: string }) {
  return (
    <EmptyState
      icon={icon}
      title={query ? `No ${kind} match “${query}”` : `No ${kind} yet`}
      hint={query ? 'Try a different name or spelling.' : `New ${kind} appear here as they join.`}
    />
  );
}

// ── People ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PeopleGrid({ users, query }: { users: any[]; query: string }) {
  if (!users.length) return <Empty icon={Users} kind="people" query={query} />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {users.map((u) => (
        <Link key={u.id} to={`/profile/${u.id}`} className="bg-card border border-line rounded-xl p-4 hover:border-primary/50 transition-colors">
          <div className="flex items-center gap-4">
            <Avatar name={u.name} src={u.avatar} size={56} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold truncate">{u.name}</h3>
                {u.verified && <VerifiedTick size={15} />}
              </div>
              <p className="text-sm text-gray-custom capitalize">{[cap(u.role), cap(u.sport), u.position].filter(Boolean).join(' · ')}</p>
              {u.location && <p className="text-xs text-gray-custom flex items-center gap-1 mt-1"><MapPin size={12} /> {u.location}</p>}
              {u.mutualCount > 0 && <p className="text-xs text-primary mt-1">{u.mutualCount} mutual connection{u.mutualCount === 1 ? '' : 's'}</p>}
            </div>
            {/* Zero-counts advertise emptiness — only show what's earned. */}
            {((u._count?.followers ?? 0) > 0 || (u._count?.highlights ?? 0) > 0) && (
              <div className="text-right text-xs text-gray-custom shrink-0">
                {(u._count?.followers ?? 0) > 0 && <p>{u._count.followers} follower{u._count.followers === 1 ? '' : 's'}</p>}
                {(u._count?.highlights ?? 0) > 0 && <p>{u._count.highlights} highlight{u._count.highlights === 1 ? '' : 's'}</p>}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Teams ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TeamsGrid({ teams, query }: { teams: any[]; query: string }) {
  if (!teams.length) return <Empty icon={Shield} kind="teams" query={query} />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {teams.map((t) => (
        <Link key={t.id} to={`/teams/${t.id}`} className="bg-card border border-line rounded-xl p-4 hover:border-primary/50 transition-colors">
          <div className="flex items-center gap-4">
            <TeamCrest name={t.name} src={t.logo} size={56} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{t.name}</h3>
              <p className="text-sm text-gray-custom capitalize">{cap(t.sport)}</p>
              <p className="text-xs text-gray-custom mt-1">{t._count?.members ?? 0} member{(t._count?.members ?? 0) === 1 ? '' : 's'}{t.captain?.name ? ` · ${t.captain.name} (captain)` : ''}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Tournaments ──────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TournamentsGrid({ tournaments, query }: { tournaments: any[]; query: string }) {
  if (!tournaments.length) return <Empty icon={Trophy} kind="tournaments" query={query} />;
  const statusChip = (s: string) => {
    const map: Record<string, string> = { IN_PROGRESS: 'bg-accent/15 text-accent', COMPLETED: 'bg-elevated text-gray-custom', UPCOMING: 'bg-primary/15 text-primary', REGISTRATION_OPEN: 'bg-primary/15 text-primary' };
    return map[s] ?? 'bg-elevated text-gray-custom';
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {tournaments.map((t) => (
        <Link key={t.id} to={`/tournaments/${t.id}`} className="bg-card border border-line rounded-xl p-4 hover:border-primary/50 transition-colors">
          <div className="flex items-center gap-4">
            <TournamentMark name={t.name} src={t.thumbnailUrl} size={56} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{t.name}</h3>
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${statusChip(t.status)}`}>{cap(String(t.status).replace(/_/g, ' '))}</span>
              </div>
              <p className="text-sm text-gray-custom capitalize">{[cap(t.sport), t.city].filter(Boolean).join(' · ')}</p>
              <p className="text-xs text-gray-custom flex items-center gap-1 mt-1"><Calendar size={12} /> {dateRange(t.startDate, t.endDate)} · {t._count?.teams ?? 0} teams</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CalendarClock, BarChart3, UserPlus, ChevronRight, MapPin, Newspaper, ExternalLink } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import ConnectButton from '../ConnectButton';
import Avatar from '../Avatar';
import { VerifiedTick } from './FeedBits';
import { useInvalidateSocialCounts } from '../../hooks/useInvalidateSocialCounts';

const SPORT_EMOJI: Record<string, string> = { BASKETBALL: '🏀', FOOTBALL: '⚽', CRICKET: '🏏' };
const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

/** One rail section: titled card with an optional "see all" link. */
function RailCard({
  icon: Icon, title, to, children,
}: { icon: typeof CalendarClock; title: string; to?: string; children: React.ReactNode }) {
  return (
    <section className="bg-ink/[0.03] border border-ink/10 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
          <Icon size={13} className="text-primary" /> {title}
        </span>
        {to && (
          <Link to={to} className="text-[11px] text-foreground/35 hover:text-primary transition-colors flex items-center gap-0.5">
            All <ChevronRight size={12} />
          </Link>
        )}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

function shortDay(iso?: string | null) {
  if (!iso) return 'TBC';
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

interface NewsItem { id: string; title: string; source: string; url: string; category: string }

/** Curated sports-news module (editorial-controlled server source). Links out to
 *  the original articles; opens in a new tab. */
function SportsNews() {
  const { data } = useQuery({
    queryKey: ['rail-news'],
    // Curated + slow-moving — refetch rarely.
    queryFn: async () => (await api.get('/news')).data.items as NewsItem[],
    staleTime: 30 * 60_000,
  });
  if (!data || data.length === 0) return null;
  return (
    <RailCard icon={Newspaper} title="Sports news">
      <div className="divide-y divide-ink/[0.06]">
        {data.map((n) => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block px-2 py-2 rounded-lg hover:bg-ink/5 transition-colors"
          >
            <p className="text-sm font-medium leading-snug group-hover:text-primary-light transition-colors">{n.title}</p>
            <p className="mt-1 text-[11px] text-foreground/40 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1"><ExternalLink size={10} /> {n.source}</span>
              <span className="w-1 h-1 rounded-full bg-foreground/20 shrink-0" />
              <span className="truncate">{n.category}</span>
            </p>
          </a>
        ))}
      </div>
    </RailCard>
  );
}

function UpcomingFixtures() {
  const { data } = useQuery({
    queryKey: ['rail-fixtures'],
    queryFn: async () => (await api.get('/tournaments/upcoming-fixtures')).data.fixtures as any[],
    staleTime: 60_000,
  });
  if (!data || data.length === 0) return null;
  return (
    <RailCard icon={CalendarClock} title="Upcoming fixtures" to="/tournaments">
      <div className="divide-y divide-ink/[0.06]">
        {data.slice(0, 4).map((f) => (
          <Link key={f.id} to={`/tournaments/${f.tournamentId}`} className="block px-2 py-2 rounded-lg hover:bg-ink/5 transition-colors">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold truncate">{f.homeTeam}</span>
              <span className="text-[10px] text-foreground/40 shrink-0">vs</span>
              <span className="font-semibold truncate text-right">{f.awayTeam}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-foreground/40 truncate">
              {SPORT_EMOJI[f.sport]} {shortDay(f.scheduledAt)}{f.court ? ` · ${f.court}` : ''} · {f.tournamentName}
            </p>
          </Link>
        ))}
      </div>
    </RailCard>
  );
}

function TopRanked() {
  const { user } = useAuth();
  const sport = user?.sport;
  const { data } = useQuery({
    queryKey: ['rail-rankings', sport],
    queryFn: async () => (await api.get(`/rankings?limit=5${sport ? `&sport=${sport}` : ''}`)).data.rankings as any[],
    staleTime: 60_000,
  });
  if (!data || data.length === 0) return null;
  return (
    <RailCard icon={BarChart3} title={sport ? `Top ${cap(sport)}` : 'Top ranked'} to="/rankings">
      <div className="space-y-0.5">
        {data.slice(0, 5).map((r) => (
          <Link key={r.id ?? r.user?.id} to={`/profile/${r.user?.id}`} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-ink/5 transition-colors">
            <span className="w-5 text-center font-numeric font-bold tabular-nums text-sm text-foreground/40">{r.rank}</span>
            <Avatar name={r.user?.name} src={r.user?.avatar} size={28} />
            <span className="flex-1 min-w-0 flex items-center gap-1">
              <span className="text-sm font-medium truncate">{r.user?.name}</span>
              {r.user?.verified && <VerifiedTick size={12} />}
            </span>
            <span className="font-numeric font-bold tabular-nums text-sm text-primary-light">{Number(r.score).toFixed(1)}</span>
          </Link>
        ))}
      </div>
    </RailCard>
  );
}

function SuggestedFollows() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { data } = useQuery({
    queryKey: ['rail-suggestions'],
    queryFn: async () => (await api.get('/connections/suggestions')).data.suggestions as any[],
    staleTime: 120_000,
  });
  const invalidateSocial = useInvalidateSocialCounts();
  const follow = useMutation({
    mutationFn: (id: string) => api.post(`/connections/follow/${id}`),
    onSuccess: () => invalidateSocial(),
  });
  const people = (data ?? []).filter((p) => !dismissed.has(p.id)).slice(0, 4);
  if (people.length === 0) return null;
  return (
    <RailCard icon={UserPlus} title="Suggested for you" to="/explore">
      <div className="space-y-0.5">
        {people.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-ink/5 transition-colors">
            <Link to={`/profile/${p.id}`} className="shrink-0"><Avatar name={p.name} src={p.avatar} size={32} /></Link>
            <Link to={`/profile/${p.id}`} className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.name}</p>
              <p className="text-[11px] text-foreground/40 truncate flex items-center gap-1">
                {[cap(p.role), cap(p.sport), p.position].filter(Boolean).join(' · ') || (p.location && <><MapPin size={9} />{p.location}</>)}
              </p>
            </Link>
            <div className="shrink-0 flex flex-col gap-1">
              <ConnectButton userId={p.id} status={p.connectionStatus} className="justify-center w-full" />
              <button
                onClick={() => { follow.mutate(p.id); setDismissed((s) => new Set(s).add(p.id)); }}
                disabled={follow.isPending}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-ink/5 text-foreground/55 border border-ink/10 hover:bg-ink/10 transition-colors"
              >
                <UserPlus size={11} /> Follow
              </button>
            </div>
          </div>
        ))}
      </div>
    </RailCard>
  );
}

/** The feed's desktop-only right rail — fixtures, rankings, people. */
export default function FeedRail() {
  return (
    <aside className="hidden lg:flex lg:flex-col gap-4 w-[300px] shrink-0">
      <SportsNews />
      <UpcomingFixtures />
      <TopRanked />
      <SuggestedFollows />
    </aside>
  );
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, UserPlus, FileText, Users, Trophy, Link2, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../api/client';
import Avatar from '../components/Avatar';

// The admin "pulse": open it for ten seconds and see if anything's happening.
// Auto-refreshes every 30s, refetches on focus, and shows how fresh the data is.

interface Overview {
  generatedAt: string;
  signups: { today: number; week: number; month: number; trendPct: number | null; spark: number[] };
  users: { total: number; realPeople: number; shells: number; realAthletes: number; byRole: Record<string, number> };
  tournaments: { total: number; byStatus: Record<string, number>; matchesTracked: number; matchesPublished: number; verifiedAthletes: number };
  engagement: {
    posts: { total: number; week: number };
    connections: { total: number; week: number };
    profileViews: { total: number; week: number };
    radarSearches: { total: number; week: number };
  };
  bySport: Record<string, number>;
  activity: { type: string; at: string; actorName: string; actorAvatar: string | null; actorRole: string | null; detail: string }[];
}

const n = (v: number) => v.toLocaleString('en-IN');
const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-ink/10 rounded-xl p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/45 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ value, label, sub, accent }: { value: string | number; label: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-elevated border border-ink/10 rounded-xl px-3.5 py-3">
      <div className={`text-2xl sm:text-[28px] leading-none font-bold tabular-nums ${accent ? 'text-primary-light' : 'text-foreground'}`}>{value}</div>
      <div className="text-xs text-foreground/55 mt-1.5">{label}</div>
      {sub && <div className="text-[11px] text-foreground/40 mt-0.5">{sub}</div>}
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const W = 120, H = 30, bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-8" aria-hidden>
      {data.map((v, i) => {
        const bh = Math.max(v > 0 ? 1.5 : 0, (v / max) * H);
        return <rect key={i} x={i * bw + 0.5} y={H - bh} width={bw - 1} height={bh} rx={0.5} className="fill-primary/70" />;
      })}
    </svg>
  );
}

const ROLE_ORDER: [string, string][] = [
  ['COACH', 'Coaches'], ['SCOUT', 'Scouts'], ['AGENT', 'Agents'],
  ['MEDIA', 'Media'], ['ORGANIZER', 'Organisers'], ['TEAM', 'Team accts'], ['ADMIN', 'Admins'],
];
const STATUS_LABEL: Record<string, string> = {
  UPCOMING: 'Upcoming', REGISTRATION_OPEN: 'Reg. open', REGISTRATION_CLOSED: 'Reg. closed',
  IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const ACTIVITY_ICON: Record<string, { icon: typeof UserPlus; color: string }> = {
  signup: { icon: UserPlus, color: 'text-primary-light' },
  post: { icon: FileText, color: 'text-sky-400' },
  team_join: { icon: Users, color: 'text-amber-400' },
  match_published: { icon: Trophy, color: 'text-emerald-400' },
  connection: { icon: Link2, color: 'text-violet-400' },
};

export default function AdminOverview() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => (await api.get('/admin/overview')).data as Overview,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  // Tick so "updated Ns ago" stays honest between fetches.
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 5_000); return () => clearInterval(t); }, []);

  if (isLoading || !data) {
    return <div className="text-center py-16 text-foreground/40 text-sm">Loading the platform pulse…</div>;
  }

  const { signups, users, tournaments, engagement, bySport, activity } = data;
  const trackedSports = new Set(['BASKETBALL', 'FOOTBALL']);
  const sports = Object.entries(bySport).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Freshness bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-foreground/50">
          <span className={`h-2 w-2 rounded-full ${isFetching ? 'bg-primary animate-pulse' : 'bg-emerald-500'}`} />
          Updated {relTime(new Date(dataUpdatedAt).toISOString())} · auto-refreshes
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-elevated border border-line text-foreground text-xs font-medium hover:bg-surface transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Signups */}
      <Section title="New signups">
        <div className="grid grid-cols-3 gap-3">
          <Stat value={n(signups.today)} label="Today" accent />
          <Stat
            value={n(signups.week)}
            label="This week"
            sub={signups.trendPct === null ? undefined : `${signups.trendPct >= 0 ? '+' : ''}${signups.trendPct}% vs prev`}
          />
          <Stat value={n(signups.month)} label="This month" />
        </div>
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1"><Sparkline data={signups.spark} /></div>
          {signups.trendPct !== null && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${signups.trendPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {signups.trendPct >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {Math.abs(signups.trendPct)}%
            </span>
          )}
        </div>
        <p className="text-[11px] text-foreground/35 mt-1">Self-serve signups over the last 30 days.</p>
      </Section>

      {/* Real user base */}
      <Section title="User base">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value={n(users.realPeople)} label="Real people" sub="excludes shells" accent />
          <Stat value={n(users.realAthletes)} label="Athletes (claimed)" />
          <Stat value={n(users.shells)} label="Organiser shells" sub="not signed up" />
          <Stat value={n(users.total)} label="Total rows" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {ROLE_ORDER.filter(([r]) => (users.byRole[r] ?? 0) > 0).map(([r, label]) => (
            <span key={r} className="text-foreground/60"><span className="font-semibold text-foreground tabular-nums">{n(users.byRole[r] ?? 0)}</span> {label}</span>
          ))}
        </div>
      </Section>

      {/* Engagement */}
      <Section title="Engagement">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value={n(engagement.posts.total)} label="Posts" sub={`+${n(engagement.posts.week)} this week`} />
          <Stat value={n(engagement.connections.total)} label="Connections" sub={`+${n(engagement.connections.week)} this week`} />
          <Stat value={n(engagement.profileViews.total)} label="Profile views" sub={`+${n(engagement.profileViews.week)} this week`} />
          <Stat value={n(engagement.radarSearches.total)} label="Radar searches" sub={`+${n(engagement.radarSearches.week)} this week`} />
        </div>
      </Section>

      {/* Tournaments */}
      <Section title="Tournaments & tracking">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value={n(tournaments.total)} label="Tournaments" />
          <Stat value={n(tournaments.matchesTracked)} label="Matches tracked" />
          <Stat value={n(tournaments.matchesPublished)} label="Results published" />
          <Stat value={n(tournaments.verifiedAthletes)} label="Verified athletes" accent />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {Object.entries(tournaments.byStatus).filter(([, v]) => v > 0).map(([s, v]) => (
            <span key={s} className="text-foreground/60"><span className="font-semibold text-foreground tabular-nums">{n(v)}</span> {STATUS_LABEL[s] ?? s}</span>
          ))}
        </div>
      </Section>

      {/* Sport breakdown */}
      <Section title="Where the data is (by sport)">
        <div className="space-y-2">
          {sports.length === 0 && <p className="text-sm text-foreground/40">No sport data yet.</p>}
          {sports.map(([sport, count]) => {
            const max = sports[0][1];
            const tracked = trackedSports.has(sport);
            return (
              <div key={sport} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-foreground/70 capitalize flex items-center gap-1.5">
                  {cap(sport)}
                  {tracked && <span className="text-[9px] uppercase tracking-wide text-primary-light bg-primary/15 px-1 py-px rounded">live</span>}
                </span>
                <div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">
                  <div className={`h-full rounded-full ${tracked ? 'bg-primary/70' : 'bg-foreground/25'}`} style={{ width: `${Math.max(3, (count / max) * 100)}%` }} />
                </div>
                <span className="w-12 text-right text-xs font-semibold text-foreground tabular-nums">{n(count)}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-foreground/35 mt-2.5">Only basketball and football have live stat tracking (marked <span className="text-primary-light">live</span>).</p>
      </Section>

      {/* Activity feed */}
      <Section title="Recent activity">
        {activity.length === 0 ? (
          <p className="text-sm text-foreground/40">Nothing yet.</p>
        ) : (
          <div className="divide-y divide-ink/5">
            {activity.map((a, i) => {
              const { icon: Icon, color } = ACTIVITY_ICON[a.type] ?? ACTIVITY_ICON.signup;
              return (
                <div key={i} className="flex items-center gap-3 py-2">
                  {a.actorAvatar !== null || a.type !== 'match_published'
                    ? <Avatar name={a.actorName} src={a.actorAvatar} size={30} />
                    : <span className="h-[30px] w-[30px] rounded-full bg-elevated flex items-center justify-center"><Trophy size={14} className="text-emerald-400" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">
                      <span className="font-medium">{a.actorName}</span>
                      <span className="text-foreground/60"> {a.detail}</span>
                    </p>
                    {a.actorRole && <p className="text-[11px] text-foreground/40 capitalize">{cap(a.actorRole)}</p>}
                  </div>
                  <span className={`shrink-0 ${color}`}><Icon size={14} /></span>
                  <span className="shrink-0 text-[11px] text-foreground/35 w-14 text-right tabular-nums">{relTime(a.at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

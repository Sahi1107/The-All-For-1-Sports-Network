import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import BallLoader from '../components/BallLoader';
import TournamentTeams from '../features/tournaments/TournamentTeams';
import TournamentFixtures from '../features/tournaments/TournamentFixtures';
import { SPORTS } from '../data/sports';
import {
  Trophy, MapPin, Calendar, Users, ArrowLeft, Crown, Award, Settings,
  Info, GitFork, ListOrdered, ChevronRight, Shield,
} from 'lucide-react';

const SPORT_ICONS: Record<string, string> = Object.fromEntries(SPORTS.map(({ value, emoji }) => [value, emoji]));
const SPORT_LABELS: Record<string, string> = Object.fromEntries(SPORTS.map(({ value, label }) => [value, label]));

const STATUS_COLORS: Record<string, string> = {
  UPCOMING: 'bg-blue-500/20 text-blue-400',
  REGISTRATION_OPEN: 'bg-accent/20 text-accent',
  REGISTRATION_CLOSED: 'bg-amber-500/20 text-amber-300',
  IN_PROGRESS: 'bg-accent/20 text-accent',
  COMPLETED: 'bg-gray-500/20 text-gray-custom',
  CANCELLED: 'bg-red-500/20 text-red-400',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TABS = [
  { key: 'about',    label: 'About',    Icon: Info },
  { key: 'fixtures', label: 'Fixtures', Icon: GitFork },
  { key: 'teams',    label: 'Teams',    Icon: Users },
  { key: 'rankings', label: 'Rankings', Icon: ListOrdered },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.role === 'ADMIN';

  const rawTab = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : 'about';
  const setTab = (key: TabKey) => setSearchParams((p) => { p.set('tab', key); return p; }, { replace: false });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tournament', id],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${id}`);
      return data.tournament;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><BallLoader /></div>;
  }
  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/tournaments')} className="flex items-center gap-2 text-sm text-gray-custom hover:text-foreground mb-6">
          <ArrowLeft size={16} /> All tournaments
        </button>
        <div className="bg-card rounded-xl border border-line p-16 text-center">
          <Trophy size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">Tournament not found.</p>
        </div>
      </div>
    );
  }

  const t = data;
  const acceptsTeamRegistration =
    t.format !== 'INDIVIDUAL' && ['UPCOMING', 'REGISTRATION_OPEN'].includes(t.status);
  const teams: any[] = t.teams ?? [];
  const myTeams: any[] = t.myTeams ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back */}
      <button onClick={() => navigate('/tournaments')} className="flex items-center gap-2 text-sm text-gray-custom hover:text-foreground mb-5">
        <ArrowLeft size={16} /> All tournaments
      </button>

      {/* Header */}
      <div className="bg-card rounded-xl border border-line p-5 sm:p-6 mb-5">
        <div className="flex items-start gap-4">
          {t.thumbnailUrl ? (
            <img src={t.thumbnailUrl} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-line shrink-0" />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-elevated border border-line flex items-center justify-center shrink-0">
              <Trophy size={28} className="text-gray-custom" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">{t.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[t.status] ?? 'bg-elevated text-gray-custom'}`}>
                {t.status?.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs text-gray-custom">
              <span className="flex items-center gap-1.5">{SPORT_ICONS[t.sport]} {SPORT_LABELS[t.sport] ?? t.sport}</span>
              {(t.city || t.venue) && <span className="flex items-center gap-1.5"><MapPin size={12} />{[t.venue, t.city].filter(Boolean).join(', ')}</span>}
              {t.startDate && <span className="flex items-center gap-1.5"><Calendar size={12} />{formatDate(t.startDate)}{t.endDate ? ` – ${formatDate(t.endDate)}` : ''}</span>}
              <span className="flex items-center gap-1.5"><Users size={12} />{teams.length} {teams.length === 1 ? 'team' : 'teams'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-line overflow-x-auto">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              activeTab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-gray-custom hover:text-foreground'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Panels */}
      {activeTab === 'about'    && <AboutPanel t={t} teams={teams} myTeams={myTeams} acceptsTeamRegistration={acceptsTeamRegistration} navigate={navigate} />}
      {activeTab === 'fixtures' && <TournamentFixtures tournamentId={t.id} sport={t.sport} isAdmin={isAdmin} />}
      {activeTab === 'teams'    && <TournamentTeams tournamentId={t.id} />}
      {activeTab === 'rankings' && <RankingsPanel sport={t.sport} navigate={navigate} />}
    </div>
  );
}

// ─── About ────────────────────────────────────────────────────────────────────
function AboutPanel({ t, teams, myTeams, acceptsTeamRegistration, navigate }: any) {
  return (
    <div className="space-y-5">
      {/* Description */}
      <div className="bg-card rounded-xl border border-line p-5 sm:p-6">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Info size={15} className="text-primary" /> About</h2>
        {t.description
          ? <p className="text-sm text-gray-custom leading-relaxed whitespace-pre-line">{t.description}</p>
          : <p className="text-sm text-gray-custom italic">No description provided.</p>}
        {(t.prizePool || t.entryFee || t.ageCategory || t.genderCategory) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-line">
            {t.prizePool != null && <Meta label="Prize pool" value={`₹${Number(t.prizePool).toLocaleString('en-IN')}`} />}
            {t.entryFee  != null && <Meta label="Entry fee"  value={`₹${Number(t.entryFee).toLocaleString('en-IN')}`} />}
            {t.ageCategory        && <Meta label="Age"        value={t.ageCategory} />}
            {t.genderCategory     && <Meta label="Category"   value={t.genderCategory} />}
          </div>
        )}
      </div>

      {/* Your team(s) */}
      {myTeams.map((team: any) => (
        <div key={team.id} className="bg-card rounded-xl border border-primary/30 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {team.logo
                ? <img src={team.logo} alt={team.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                : <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center font-bold text-primary-light shrink-0">{team.name?.charAt(0).toUpperCase()}</div>}
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{team.name}</p>
                <p className="text-xs text-gray-custom">
                  Your team
                  {team.myRole === 'CAPTAIN' && <> · <Crown size={10} className="inline -mt-0.5" /> Captain</>}
                  {team.myRole === 'COACH'   && <> · <Award size={10} className="inline -mt-0.5" /> Coach</>}
                </p>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${team.summary.isComplete ? 'bg-accent/20 text-accent' : 'bg-amber-500/20 text-amber-300'}`}>
              {team.summary.isComplete ? 'Complete' : `${team.summary.accepted}/${team.summary.total} accepted${team.summary.declined ? ` · ${team.summary.declined} declined` : ''}`}
            </span>
          </div>
          {team.myRole === 'CAPTAIN' && (
            <button onClick={() => navigate(`/teams/${team.id}`)} className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-surface hover:bg-elevated border border-line text-sm rounded-lg transition-colors">
              <Settings size={13} /> Manage team
            </button>
          )}
        </div>
      ))}

      {/* Register CTA */}
      {acceptsTeamRegistration && myTeams.length === 0 && (
        <button onClick={() => navigate(`/tournaments/${t.id}/register`)} className="w-full px-4 py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold text-sm rounded-lg transition-colors">
          Register a team
        </button>
      )}

      {/* Registered teams */}
      <div className="bg-card rounded-xl border border-line p-5 sm:p-6">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Shield size={15} className="text-primary" /> Registered teams ({teams.length})</h2>
        {teams.length === 0 ? (
          <p className="text-sm text-gray-custom italic">No teams registered yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {teams.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 py-2 px-3 bg-surface rounded-lg border border-line">
                {r.team?.logo
                  ? <img src={r.team.logo} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
                  : <div className="w-7 h-7 rounded-md bg-elevated flex items-center justify-center text-xs font-bold text-gray-custom shrink-0">{r.team?.name?.charAt(0).toUpperCase()}</div>}
                <span className="text-sm truncate">{r.team?.name}</span>
                <span className="text-xs text-gray-custom ml-auto shrink-0">{r.team?._count?.members ?? 0} players</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-custom">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

// ─── Rankings (links to the platform-wide Rankings page) ────────────────────────
function RankingsPanel({ sport, navigate }: { sport: string; navigate: (to: string) => void }) {
  return (
    <div className="bg-card rounded-xl border border-line p-8 sm:p-10 text-center">
      <ListOrdered size={28} className="mx-auto mb-3 text-primary" />
      <h2 className="text-base font-semibold mb-1.5">Player rankings</h2>
      <p className="text-sm text-gray-custom max-w-md mx-auto mb-5">
        Rankings are tracked platform-wide across every {SPORT_LABELS[sport] ?? sport} tournament — not per event —
        so a player's standing reflects their whole verified record.
      </p>
      <button
        onClick={() => navigate('/rankings')}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold text-sm rounded-lg transition-colors"
      >
        View {SPORT_LABELS[sport] ?? sport} rankings <ChevronRight size={15} />
      </button>
    </div>
  );
}

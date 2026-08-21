import Avatar from '../components/Avatar';
import BallLoader from '../components/BallLoader';
import { useState, useRef } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { Shield, Users, BarChart3, CheckCircle, Trash2, UserPlus, Trophy, Plus, Upload, Eye, ChevronDown, ChevronUp, Crown, Award, Activity, ChevronRight, Flag, AlertTriangle, ShieldAlert, Ban, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { SPORTS } from '../data/sports';
import RosterEditorModal from '../features/tournaments/RosterEditorModal';
import AddTeamModal from '../features/tournaments/AddTeamModal';
import DeleteTournamentModal from '../features/tournaments/DeleteTournamentModal';
import AdminOverview from './AdminOverview';

type Tab = 'overview' | 'users' | 'stats' | 'reports' | 'appeals' | 'new-profile' | 'link-profile' | 'new-team' | 'create-admin' | 'tournaments' | 'feed-preview';

const EMPTY_LINK_FORM = { email: '', guardianEmail: '' };

/** Effective age of an unclaimed profile: date of birth first, the stored `age`
 *  only as a fallback. Mirrors validateLinkInput on the server so the guardian
 *  field appears exactly when the server is going to insist on it. */
function unclaimedAge(p: { dateOfBirth: string | null; age: number | null }): number | null {
  if (!p.dateOfBirth) return p.age ?? null;
  const dob = new Date(p.dateOfBirth);
  if (Number.isNaN(dob.getTime())) return p.age ?? null;
  const t = new Date();
  let a = t.getUTCFullYear() - dob.getUTCFullYear();
  const m = t.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && t.getUTCDate() < dob.getUTCDate())) a--;
  return a;
}

const EMPTY_ATHLETE_FORM = {
  name: '', email: '', sport: '', role: 'ATHLETE' as 'ATHLETE' | 'COACH',
  dateOfBirth: '', gender: '' as '' | 'MALE' | 'FEMALE',
  position: '', phone: '', guardianEmail: '',
};

const EMPTY_TEAM_FORM = { name: '', sport: 'BASKETBALL', captainId: '', tournamentId: '' };

type CaptainPick = { id: string; name: string; email: string; avatar: string | null };

const AGE_CATEGORIES = ['U12', 'U14', 'U16', 'U18', 'U19', 'U21', 'U23', 'OPEN', 'MASTERS'];
const GENDER_CATEGORIES = ['MEN', 'WOMEN', 'MIXED', 'OPEN'];
const TOURNAMENT_FORMATS = [
  { value: 'TEAM',       label: 'Team' },
  { value: 'DOUBLES',    label: 'Doubles' },
  { value: 'INDIVIDUAL', label: 'Individual' },
];

interface TournamentForm {
  name: string;
  sport: string;
  /** Basketball code — 'FIVE_V_FIVE' | 'THREE_X_THREE'. Ignored for other sports. */
  variant: string;
  description: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  entryFee: string;
  prizePool: string;
  maxTeams: string;
  ageCategory: string;
  genderCategory: string;
  format: string;
  minRosterSize: string;
  maxRosterSize: string;
}

const emptyTournamentForm: TournamentForm = {
  name: '', sport: 'BASKETBALL', variant: 'FIVE_V_FIVE', description: '', venue: '', city: '',
  startDate: '', endDate: '', entryFee: '', prizePool: '', maxTeams: '',
  ageCategory: '', genderCategory: '',
  format: 'TEAM', minRosterSize: '', maxRosterSize: '',
};


// Lifecycle transitions offered per status (must mirror the server's guard).
const LIFECYCLE_ACTIONS: Record<string, { to: string; label: string; primary?: boolean }[]> = {
  UPCOMING:            [{ to: 'REGISTRATION_OPEN', label: 'Open registration', primary: true }],
  REGISTRATION_OPEN:   [{ to: 'REGISTRATION_CLOSED', label: 'Close registration', primary: true }],
  REGISTRATION_CLOSED: [{ to: 'IN_PROGRESS', label: 'Start tournament', primary: true }, { to: 'REGISTRATION_OPEN', label: 'Reopen registration' }],
  IN_PROGRESS:         [{ to: 'COMPLETED', label: 'Mark complete', primary: true }],
  COMPLETED:           [{ to: 'IN_PROGRESS', label: 'Reopen' }],
  CANCELLED:           [{ to: 'UPCOMING', label: 'Reactivate', primary: true }],
};
const STATUS_STYLE: Record<string, string> = {
  UPCOMING: 'bg-blue-500/20 text-blue-400',
  REGISTRATION_OPEN: 'bg-accent/20 text-accent',
  REGISTRATION_CLOSED: 'bg-amber-500/20 text-amber-300',
  IN_PROGRESS: 'bg-accent/20 text-accent',
  COMPLETED: 'bg-gray-500/20 text-gray-custom',
  CANCELLED: 'bg-red-500/20 text-red-400',
};
const TRACKABLE_STATUSES = new Set(['REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED']);

/** Admin lifecycle control: moves a tournament through its statuses and shows
 *  when live tracking becomes available. Wired to PUT /tournaments/:id. */
function TournamentLifecycle({ tournament }: { tournament: any }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: string) => api.put(`/tournaments/${tournament.id}`, { status }),
    onSuccess: (_d, status) => {
      toast.success(`Status → ${status.replace(/_/g, ' ').toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update status'),
  });
  const actions = LIFECYCLE_ACTIONS[tournament.status] ?? [];
  const canCancel = !['CANCELLED', 'COMPLETED'].includes(tournament.status);
  const trackable = TRACKABLE_STATUSES.has(tournament.status);

  return (
    <div className="px-5 py-4 border-b border-line bg-surface/30 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-custom uppercase tracking-wide">Lifecycle</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[tournament.status] ?? 'bg-elevated text-gray-custom'}`}>
          {tournament.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {actions.map((a) => (
          <button
            key={a.to}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(a.to)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
              a.primary ? 'bg-primary hover:bg-primary-dark text-on-primary' : 'bg-elevated hover:bg-card border border-line text-foreground'
            }`}
          >
            {a.label}
          </button>
        ))}
        {canCancel && (
          <button
            disabled={mutation.isPending}
            onClick={() => { if (confirm(`Cancel “${tournament.name}”? Registered teams stay, but it leaves the active lifecycle.`)) mutation.mutate('CANCELLED'); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-elevated border border-line text-red-400 disabled:opacity-50"
          >
            Cancel tournament
          </button>
        )}
        {actions.length === 0 && !canCancel && (
          <span className="text-xs text-gray-custom">No further lifecycle actions.</span>
        )}
      </div>
      <div className={`text-xs flex items-center gap-1.5 ${trackable ? 'text-accent' : 'text-gray-custom'}`}>
        {trackable ? (
          <><CheckCircle size={12} /> Live tracking enabled — <Link to={`/admin/stat-tracker/${tournament.id}`} className="text-primary-light hover:underline">open Stat Tracker</Link></>
        ) : (
          <>Close registration to enable live tracking.</>
        )}
      </div>
    </div>
  );
}

function TournamentRegistrationsPanel({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-tournament-registrations', tournamentId],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${tournamentId}/registrations`);
      return data;
    },
  });
  const [editTeam, setEditTeam] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  if (isLoading) {
    return (
      <div className="px-5 py-4 bg-surface/30 flex justify-center">
        <BallLoader />
      </div>
    );
  }

  const registrations: any[] = data?.registrations ?? [];
  const sport: string | undefined = data?.tournament?.sport;

  return (
    <div className="px-5 py-4 bg-surface/30 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-custom">{registrations.length} team{registrations.length === 1 ? '' : 's'}</span>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-line hover:border-primary text-xs font-medium rounded-lg transition-colors"
        >
          <UserPlus size={13} /> Add team
        </button>
      </div>

      {registrations.length === 0 && (
        <p className="text-xs text-gray-custom">No teams yet — add one, import a roster CSV, or share the registration link.</p>
      )}

      {registrations.map((r: any) => {
        const { team, summary } = r;
        return (
          <div key={r.id} className="bg-surface rounded-lg border border-line p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{team.name}</p>
                <p className="text-xs text-gray-custom">
                  Registered {new Date(r.registeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  summary.isComplete
                    ? 'bg-accent/20 text-accent'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {summary.isComplete
                  ? 'Complete'
                  : `${summary.accepted}/${summary.total} accepted${summary.declined ? ` · ${summary.declined} declined` : ''}`}
              </span>
            </div>

            <div className="flex flex-wrap gap-3 text-xs mb-3">
              {team.captain && (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Crown size={11} />
                  {team.captain.name} <span className="text-gray-custom">(captain)</span>
                </span>
              )}
              {team.coach && (
                <span className="flex items-center gap-1.5 text-primary-light">
                  <Award size={11} />
                  {team.coach.name} <span className="text-gray-custom">(coach)</span>
                </span>
              )}
            </div>

            {summary.pending > 0 && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-300 mb-3">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{summary.pending} player{summary.pending > 1 ? 's' : ''} haven't accepted — excluded from the draw until they do (or add them directly).</span>
              </div>
            )}

            <div className="border-t border-line pt-3 space-y-1.5">
              {team.members.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar name={m.user.name} src={m.user.avatar} size={20} />
                    <span className="truncate">{m.user.name}</span>
                    <span className="text-gray-custom shrink-0">· {m.role.toLowerCase()}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                      m.status === 'ACCEPTED' ? 'bg-accent/20 text-accent'
                        : m.status === 'DECLINED' ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-500/20 text-gray-custom'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3">
              <button onClick={() => setEditTeam(team)} className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-line hover:border-primary text-xs font-medium rounded-lg transition-colors">
                <UserPlus size={13} /> Edit roster
              </button>
            </div>
          </div>
        );
      })}

      {editTeam && <RosterEditorModal tournamentId={tournamentId} team={editTeam} sport={sport} onClose={() => setEditTeam(null)} />}
      {showAdd && <AddTeamModal tournamentId={tournamentId} sport={sport} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [reportStatus, setReportStatus] = useState('OPEN');
  const [appealStatus, setAppealStatus] = useState('PENDING');

  // Create-admin form state
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '' });
  const [athleteForm, setAthleteForm] = useState(EMPTY_ATHLETE_FORM);
  const [showPassword, setShowPassword] = useState(false);

  // Link Profile tab: browse unclaimed shells and bind an identity to one
  const [unclaimedSearch, setUnclaimedSearch] = useState('');
  const [unclaimedSport, setUnclaimedSport] = useState('');
  const [unclaimedPage, setUnclaimedPage] = useState(1);
  const [linkTarget, setLinkTarget] = useState<any | null>(null);
  const [linkForm, setLinkForm] = useState(EMPTY_LINK_FORM);

  // Teams tab: create-empty | create-with-players | manage members
  const [teamMode, setTeamMode] = useState<'empty' | 'compose' | 'manage'>('empty');
  // New Team form state (+ captain picker) — the "empty team" create mode
  const [teamForm, setTeamForm] = useState(EMPTY_TEAM_FORM);
  const [captainQuery, setCaptainQuery] = useState('');
  const [selectedCaptain, setSelectedCaptain] = useState<CaptainPick | null>(null);

  // Tournament form state
  const [tournamentForm, setTournamentForm] = useState<TournamentForm>(emptyTournamentForm);
  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [expandedTournamentId, setExpandedTournamentId] = useState<string | null>(null);
  const [deleteTournament, setDeleteTournament] = useState<{ id: string; name: string } | null>(null);

  // Redirect non-admins at the route level
  if (user?.role !== 'ADMIN') return <Navigate to="/home" replace />;

  // ─── Queries ──────────────────────────────────────────────────

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', search, roleFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      const { data } = await api.get(`/admin/users?${params}`);
      return data;
    },
    enabled: tab === 'users',
  });

  const { data: statsData } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { data } = await api.get('/admin/stats');
      return data;
    },
    enabled: tab === 'stats',
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ['admin-reports', reportStatus],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (reportStatus) params.set('status', reportStatus);
      const { data } = await api.get(`/admin/reports?${params}`);
      return data;
    },
    enabled: tab === 'reports',
  });

  const { data: appealsData, isLoading: appealsLoading } = useQuery({
    queryKey: ['admin-appeals', appealStatus],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (appealStatus) params.set('status', appealStatus);
      const { data } = await api.get(`/admin/appeals?${params}`);
      return data;
    },
    enabled: tab === 'appeals',
  });

  const { data: unclaimedData, isLoading: unclaimedLoading } = useQuery({
    queryKey: ['admin-unclaimed', unclaimedSearch, unclaimedSport, unclaimedPage],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(unclaimedPage), limit: '20' });
      if (unclaimedSearch) params.set('search', unclaimedSearch);
      if (unclaimedSport) params.set('sport', unclaimedSport);
      const { data } = await api.get(`/admin/unclaimed?${params}`);
      return data;
    },
    enabled: tab === 'link-profile',
  });

  // ─── Mutations ────────────────────────────────────────────────

  const verifyMutation = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      api.patch(`/admin/users/${id}/verify`, { verified }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User updated'); },
    onError: () => toast.error('Action failed'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/admin/users/${id}/role`, { role }),
    // Confirm the role the server actually persisted (it echoes it back), and refetch
    // so the row reflects live DB state — the admin never has to guess if it took.
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(`Role updated to ${res.data.role}`);
    },
    onError: () => toast.error('Failed to update role'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      toast.success('User deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const reportStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/admin/reports/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-reports'] }); toast.success('Report updated'); },
    onError: () => toast.error('Failed to update report'),
  });

  const removeContentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/reports/${id}/content`),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      toast.success(data?.message ?? 'Content removed');
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to remove content'),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, suspend, reason }: { id: string; suspend: boolean; reason?: string }) =>
      api.patch(`/admin/users/${id}/suspend`, { suspend, reason }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      toast.success(v.suspend ? 'User suspended' : 'Suspension lifted');
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to update suspension'),
  });

  const resolveAppealMutation = useMutation({
    mutationFn: ({ id, status, reviewNote }: { id: string; status: string; reviewNote?: string }) =>
      api.patch(`/admin/appeals/${id}`, { status, reviewNote }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['admin-appeals'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(v.status === 'GRANTED' ? 'Appeal approved' : v.status === 'DENIED' ? 'Appeal denied' : 'Appeal updated');
    },
    onError: () => toast.error('Failed to update appeal'),
  });

  const createAdminMutation = useMutation({
    mutationFn: (body: { name: string; email: string; password: string }) =>
      api.post('/admin/create-admin', body),
    onSuccess: () => {
      toast.success('Admin account created');
      setAdminForm({ name: '', email: '', password: '' });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create admin');
    },
  });

  const createAthleteMutation = useMutation({
    mutationFn: async (form: typeof EMPTY_ATHLETE_FORM) => {
      const { data } = await api.post('/admin/athletes', {
        name: form.name,
        email: form.email,
        sport: form.sport,
        role: form.role,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        position: form.position || undefined,
        phone: form.phone || undefined,
        guardianEmail: form.guardianEmail || undefined,
      });
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        data.guardianConsentPending
          ? 'Under-13 profile created — a guardian consent email was sent. The account activates once the guardian consents.'
          : 'Profile created — a welcome email with login details was sent.',
      );
      setAthleteForm(EMPTY_ATHLETE_FORM);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create profile');
    },
  });

  const linkProfileMutation = useMutation({
    mutationFn: async ({ id, email, guardianEmail }: { id: string; email: string; guardianEmail: string }) => {
      const { data } = await api.post(`/admin/unclaimed/${id}/link`, {
        email,
        guardianEmail: guardianEmail || undefined,
      });
      return data;
    },
    // The three outcomes differ in what the player has to do next, so say which
    // one happened rather than a generic "linked".
    onSuccess: (data) => {
      toast.success(
        data.guardianConsentPending
          ? `${data.name} linked — a consent email went to the guardian. The login activates once they consent.`
          : data.linkedExistingIdentity
            ? `${data.name} linked to ${data.email} — that email already had a login, so they can sign in now.`
            : `${data.name} linked — a welcome email with login details went to ${data.email}.`,
        { duration: 6000 },
      );
      setLinkTarget(null);
      setLinkForm(EMPTY_LINK_FORM);
      qc.invalidateQueries({ queryKey: ['admin-unclaimed'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to link profile'),
  });

  // Derived state for the Link Profile panel (mirrors the server's guardian gate).
  const linkTargetAge = linkTarget ? unclaimedAge(linkTarget) : null;
  const linkTargetUnder13 =
    !!linkTarget && linkTarget.role === 'ATHLETE' && linkTargetAge !== null && linkTargetAge < 13;
  const linkFormValid = !!(
    linkForm.email.trim() &&
    (!linkTargetUnder13 || linkForm.guardianEmail.trim())
  );

  // Derived state for the New Profile form (mirrors the server's under-13 rule).
  const athleteAge = (() => {
    if (!athleteForm.dateOfBirth) return null;
    const dob = new Date(athleteForm.dateOfBirth);
    const t = new Date();
    let a = t.getFullYear() - dob.getFullYear();
    const m = t.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < dob.getDate())) a--;
    return a;
  })();
  const athleteUnder13 = athleteForm.role === 'ATHLETE' && athleteAge !== null && athleteAge < 13;
  const athleteDobRequired = athleteForm.role === 'ATHLETE';
  const athleteFormValid = !!(
    athleteForm.name.trim() &&
    athleteForm.email.trim() &&
    athleteForm.sport &&
    (!athleteDobRequired || athleteForm.dateOfBirth) &&
    (!athleteUnder13 || athleteForm.guardianEmail.trim())
  );

  // ─── New Team (captain picker + create) ───────────────────────

  // Search existing profiles for a captain (excludes admins). Reuses the admin
  // users list endpoint; disabled once a captain is chosen.
  const captainResults = useQuery({
    queryKey: ['admin-captain-search', captainQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ search: captainQuery.trim(), limit: '8' });
      const { data } = await api.get(`/admin/users?${params}`);
      return ((data.users ?? []) as any[])
        .filter((u) => u.role !== 'ADMIN')
        .map((u) => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar ?? null })) as CaptainPick[];
    },
    enabled: captainQuery.trim().length >= 2 && !selectedCaptain,
  });

  const createTeamMutation = useMutation({
    mutationFn: async (form: { name: string; sport: string; captainId: string; tournamentId: string }) => {
      const body: any = { name: form.name, sport: form.sport, captainId: form.captainId };
      if (form.tournamentId) body.tournamentId = form.tournamentId;
      const { data } = await api.post('/admin/teams', body);
      return data.team;
    },
    onSuccess: (team: any) => {
      toast.success(`Team "${team.name}" created${selectedCaptain ? ` — ${selectedCaptain.name} is captain` : ''}`);
      setTeamForm(EMPTY_TEAM_FORM);
      setSelectedCaptain(null);
      setCaptainQuery('');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create team'),
  });

  const teamFormValid = !!(teamForm.name.trim() && teamForm.sport && teamForm.captainId);

  // ─── Tournaments ──────────────────────────────────────────────

  const { data: tournamentsData, isLoading: tournamentsLoading } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data } = await api.get('/tournaments?limit=50');
      return data;
    },
    // Also needed on the Teams tab: team create/compose can attach to a tournament.
    enabled: tab === 'tournaments' || tab === 'new-team',
  });

  const createTournamentMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('name', tournamentForm.name);
      fd.append('sport', tournamentForm.sport);
      // Basketball only. Sent always so the server sees an explicit value; it
      // forces 5v5 for every other sport regardless.
      fd.append('variant', tournamentForm.variant);
      // Backend expects ISO-8601. <input type="date"> gives YYYY-MM-DD, so we
      // append a fixed time-of-day to keep the payload well-formed.
      fd.append('startDate', new Date(`${tournamentForm.startDate}T00:00:00Z`).toISOString());
      fd.append('endDate',   new Date(`${tournamentForm.endDate}T23:59:59Z`).toISOString());
      if (tournamentForm.description)    fd.append('description', tournamentForm.description);
      if (tournamentForm.venue)          fd.append('venue', tournamentForm.venue);
      if (tournamentForm.city)           fd.append('city', tournamentForm.city);
      if (tournamentForm.entryFee)       fd.append('entryFee', tournamentForm.entryFee);
      if (tournamentForm.prizePool)      fd.append('prizePool', tournamentForm.prizePool);
      if (tournamentForm.maxTeams)       fd.append('maxTeams', tournamentForm.maxTeams);
      if (tournamentForm.ageCategory)    fd.append('ageCategory', tournamentForm.ageCategory);
      if (tournamentForm.genderCategory) fd.append('genderCategory', tournamentForm.genderCategory);
      if (tournamentForm.format)         fd.append('format', tournamentForm.format);
      if (tournamentForm.minRosterSize)  fd.append('minRosterSize', tournamentForm.minRosterSize);
      if (tournamentForm.maxRosterSize)  fd.append('maxRosterSize', tournamentForm.maxRosterSize);
      if (thumbnailFile)                 fd.append('thumbnail', thumbnailFile);
      const { data } = await api.post('/tournaments', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: () => {
      toast.success('Tournament created');
      setTournamentForm(emptyTournamentForm);
      setThumbnailFile(null);
      setThumbnailPreview(null);
      setShowTournamentForm(false);
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
    onError: (err: any) => {
      const details = err.response?.data?.details;
      toast.error(
        Array.isArray(details) && details.length > 0
          ? details[0]
          : err.response?.data?.error || 'Failed to create tournament',
      );
    },
  });

  const handleThumbnailPick = (file: File | null) => {
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailFile(file);
    setThumbnailPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleCreateTournament = (e: React.FormEvent) => {
    e.preventDefault();
    if (new Date(tournamentForm.endDate) < new Date(tournamentForm.startDate)) {
      toast.error('End date must be on or after start date');
      return;
    }
    createTournamentMutation.mutate();
  };

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    createAdminMutation.mutate(adminForm);
  };

  const users = usersData?.users ?? [];
  const stats = statsData?.stats;

  return (
    <div>
      {deleteTournament && (
        <DeleteTournamentModal
          tournamentId={deleteTournament.id}
          tournamentName={deleteTournament.name}
          onClose={() => setDeleteTournament(null)}
        />
      )}
      <div className="flex items-center gap-3 mb-6">
        <Shield size={22} className="text-purple-400" />
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      </div>

      {/* Stat Tracker entry */}
      <Link
        to="/admin/stat-tracker"
        className="flex items-center gap-4 mb-6 p-4 rounded-xl border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
      >
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <Activity size={20} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Open Stat Tracker</p>
          <p className="text-xs text-gray-custom">Live-track basketball & football tournaments, export sheets, publish to profiles.</p>
        </div>
        <ChevronRight size={18} className="text-gray-custom" />
      </Link>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          ['overview',     'Overview',       Activity],
          ['users',        'Users',          Users],
          ['stats',        'Platform Stats', BarChart3],
          ['reports',      'Reports',        Flag],
          ['appeals',      'Appeals',        ShieldAlert],
          ['new-profile',  'New Profile',    UserPlus],
          ['link-profile', 'Link Profile',   Link2],
          ['new-team',     'Teams',          Crown],
          ['tournaments',  'Tournaments',    Trophy],
          ['feed-preview', 'Feed Preview',   Eye],
          ['create-admin', 'Create Admin',   Shield],
        ] as const).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-card text-gray-custom hover:text-foreground border border-line'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ──────────────────────────────────────────── */}
      {tab === 'overview' && <AdminOverview />}

      {/* ── Users Tab ─────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name..."
              className="flex-1 min-w-48 bg-card border border-line rounded-lg px-3 py-2 text-sm text-foreground placeholder-gray-custom focus:outline-none focus:border-primary"
            />
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="bg-card border border-line rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">All Roles</option>
              <option value="ATHLETE">Athlete</option>
              <option value="COACH">Coach</option>
              <option value="SCOUT">Scout</option>
              <option value="AGENT">Agent</option>
              <option value="MEDIA">Media</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          {usersLoading ? (
            <div className="flex justify-center py-16">
              <BallLoader />
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-line overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-line text-xs text-gray-custom font-medium">
                <div className="col-span-4">User</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Sport</div>
                <div className="col-span-2">Verified</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="divide-y divide-line">
                {users.length === 0 ? (
                  <div className="p-10 text-center text-gray-custom text-sm">No users found</div>
                ) : users.map((u: any) => (
                  <div key={u.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-surface/20 transition-colors">
                    {/* User */}
                    <div className="col-span-4 flex items-center gap-3 min-w-0">
                      <Avatar name={u.name} src={u.avatar} size={32} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        <p className="text-xs text-gray-custom truncate">{u.email}</p>
                      </div>
                    </div>

                    {/* Role */}
                    <div className="col-span-2">
                      <select
                        value={u.role}
                        onChange={(e) => roleMutation.mutate({ id: u.id, role: e.target.value })}
                        className="bg-surface border border-line rounded px-1.5 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="ATHLETE">Athlete</option>
                        <option value="COACH">Coach</option>
                        <option value="SCOUT">Scout</option>
                        <option value="AGENT">Agent</option>
                        <option value="MEDIA">Media</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>

                    {/* Sport */}
                    <div className="col-span-2 text-xs text-gray-custom">
                      {u.role === 'ADMIN' ? '—' : u.sport}
                    </div>

                    {/* Verified */}
                    <div className="col-span-2">
                      <button
                        onClick={() => verifyMutation.mutate({ id: u.id, verified: !u.verified })}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-colors ${
                          u.verified
                            ? 'bg-accent/20 text-accent hover:bg-red-500/20 hover:text-red-400'
                            : 'bg-surface text-gray-custom hover:bg-accent/20 hover:text-accent border border-line'
                        }`}
                      >
                        <CheckCircle size={11} />
                        {u.verified ? 'Verified' : 'Unverified'}
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="col-span-2 flex justify-end gap-2">
                      <button
                        onClick={() => {
                          if (u.id === user.id) { toast.error('Cannot delete your own account'); return; }
                          if (confirm(`Delete ${u.name}? This cannot be undone.`)) {
                            deleteMutation.mutate(u.id);
                          }
                        }}
                        className="p-1.5 text-gray-custom hover:text-red-400 transition-colors rounded"
                        title="Delete user"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {usersData?.total > 20 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-line">
                  <span className="text-xs text-gray-custom">{usersData.total} total users</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 text-sm text-gray-custom hover:text-foreground disabled:opacity-40 border border-line rounded-lg"
                    >
                      Prev
                    </button>
                    <span className="px-3 py-1 text-sm">Page {page}</span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page * 20 >= usersData.total}
                      className="px-3 py-1 text-sm text-gray-custom hover:text-foreground disabled:opacity-40 border border-line rounded-lg"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Stats Tab ─────────────────────────────────────────────── */}
      {tab === 'stats' && (
        <div>
          {!stats ? (
            <div className="flex justify-center py-16">
              <BallLoader />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Total Users',   value: stats.totalUsers,   color: 'text-primary-light' },
                  { label: 'Athletes',      value: stats.athletes,     color: 'text-foreground' },
                  { label: 'Coaches',       value: stats.coaches,      color: 'text-secondary' },
                  { label: 'Scouts',        value: stats.scouts,       color: 'text-accent' },
                  { label: 'Agents',        value: stats.agents,       color: 'text-amber-400' },
                  { label: 'Team Accounts', value: stats.teamAccounts, color: 'text-foreground' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-card rounded-xl border border-line p-5 text-center">
                    <p className={`text-3xl font-bold ${color}`}>{value ?? 0}</p>
                    <p className="text-sm text-gray-custom mt-1">{label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Highlights',      value: stats.highlights },
                  { label: 'Teams',           value: stats.teams },
                  { label: 'Tournaments',     value: stats.tournaments },
                  { label: 'Verified Users',  value: stats.verifiedUsers },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-card rounded-xl border border-line p-5 text-center">
                    <p className="text-3xl font-bold text-foreground">{value ?? 0}</p>
                    <p className="text-sm text-gray-custom mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {stats.bySport && (
                <div className="bg-card rounded-xl border border-line p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 size={16} className="text-primary-light" />
                    Users by Sport
                  </h2>
                  <div className="space-y-3">
                    {Object.entries(stats.bySport).map(([sport, count]: [string, any]) => {
                      const pct = stats.totalUsers ? Math.round((count / stats.totalUsers) * 100) : 0;
                      return (
                        <div key={sport}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{sport}</span>
                            <span className="text-gray-custom">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full bg-surface rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Reports Tab (moderation queue) ────────────────────────── */}
      {tab === 'reports' && (
        <div>
          {/* Status filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {([
              ['OPEN', 'Open'],
              ['REVIEWED', 'Reviewed'],
              ['DISMISSED', 'Dismissed'],
              ['ACTIONED', 'Actioned'],
              ['', 'All'],
            ] as const).map(([value, label]) => (
              <button
                key={label}
                onClick={() => setReportStatus(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  reportStatus === value
                    ? 'bg-primary text-on-primary font-semibold'
                    : 'bg-card text-gray-custom hover:text-foreground border border-line'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {reportsLoading ? (
            <p className="text-gray-custom text-sm">Loading reports…</p>
          ) : !reportsData?.reports?.length ? (
            <div className="bg-card border border-line rounded-xl p-8 text-center">
              <Flag size={32} className="mx-auto mb-3 text-gray-custom" />
              <p className="text-sm text-gray-custom">No reports{reportStatus ? ` with status ${reportStatus.toLowerCase()}` : ''}.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reportsData.reports.map((r: any) => {
                const isContent = r.targetType !== 'USER';
                const statusColor =
                  r.status === 'OPEN' ? 'bg-red-500/15 text-red-400'
                  : r.status === 'REVIEWED' ? 'bg-blue-500/15 text-blue-400'
                  : r.status === 'ACTIONED' ? 'bg-green-500/15 text-green-400'
                  : 'bg-gray-500/15 text-gray-400';
                return (
                  <div key={r.id} className="bg-card border border-line rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-elevated text-foreground/80">
                          {r.targetType}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusColor}`}>
                          {r.status}
                        </span>
                        <span className="text-xs text-gray-custom">
                          {new Date(r.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm font-medium text-foreground">
                      Reason: <span className="font-normal">{r.reason}</span>
                    </p>
                    {r.details && (
                      <p className="text-xs text-gray-custom mt-0.5">{r.details}</p>
                    )}

                    {/* Reported content preview */}
                    {isContent && (
                      <div className="mt-2 rounded-lg bg-surface border border-line px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-gray-custom mb-1">Reported content</p>
                        {r.contentExists === false ? (
                          <p className="text-xs italic text-gray-custom">[content already removed]</p>
                        ) : (
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words">
                            {r.contentPreview || <span className="italic text-gray-custom">[no text content]</span>}
                          </p>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-gray-custom mt-2">
                      Reported by <span className="text-foreground/70">{r.reporter?.name ?? 'Unknown'}</span>
                      {' · '}Author:{' '}
                      <Link to={`/profile/${r.reported?.id}`} className="text-primary hover:text-primary-light">
                        {r.reported?.name ?? 'Unknown'}
                      </Link>
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {r.status !== 'REVIEWED' && (
                        <button
                          onClick={() => reportStatusMutation.mutate({ id: r.id, status: 'REVIEWED' })}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-elevated border border-line text-foreground/80 hover:text-foreground transition-colors"
                        >
                          Mark reviewed
                        </button>
                      )}
                      {r.status !== 'DISMISSED' && (
                        <button
                          onClick={() => reportStatusMutation.mutate({ id: r.id, status: 'DISMISSED' })}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-elevated border border-line text-foreground/80 hover:text-foreground transition-colors"
                        >
                          Dismiss
                        </button>
                      )}
                      {isContent && r.contentExists !== false && (
                        <button
                          onClick={() => {
                            if (confirm('Remove this content? This cannot be undone and will resolve all reports for it.')) {
                              removeContentMutation.mutate(r.id);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                        >
                          <Trash2 size={13} /> Remove content
                        </button>
                      )}
                      {r.reported?.id && (
                        <button
                          onClick={() => {
                            const reason = prompt('Reason for suspension (this is shown to the user and in their appeal):', r.reason ?? '');
                            if (reason !== null) suspendMutation.mutate({ id: r.reported.id, suspend: true, reason: reason || undefined });
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-colors"
                        >
                          <Ban size={13} /> Suspend user
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${r.reported?.name ?? 'this user'}'s entire account? This deletes all their data and cannot be undone.`)) {
                            deleteMutation.mutate(r.reported.id);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                      >
                        <Trash2 size={13} /> Delete account
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tournaments Tab ───────────────────────────────────────── */}
      {tab === 'tournaments' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-custom">
              {tournamentsData?.total ?? 0} total tournaments
            </p>
            <button
              onClick={() => setShowTournamentForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm transition-colors"
            >
              <Plus size={15} />
              {showTournamentForm ? 'Cancel' : 'Add Tournament'}
            </button>
          </div>

          {showTournamentForm && (
            <form
              onSubmit={handleCreateTournament}
              className="bg-card rounded-xl border border-line p-6 space-y-5"
            >
              <div className="flex items-center gap-2">
                <Trophy size={18} className="text-primary" />
                <h2 className="font-semibold text-lg">New Tournament</h2>
              </div>

              {/* Thumbnail */}
              <div>
                <label className="block text-sm text-gray-custom mb-2">Thumbnail</label>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => thumbnailInputRef.current?.click()}
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-line hover:border-primary/60 flex items-center justify-center overflow-hidden bg-surface transition-colors"
                  >
                    {thumbnailPreview
                      ? <img src={thumbnailPreview} alt="thumbnail" className="w-full h-full object-cover" />
                      : <Upload size={20} className="text-gray-custom" />}
                  </button>
                  <div className="text-xs text-gray-custom">
                    <p>JPG, PNG, or WebP — max 5 MB</p>
                    {thumbnailFile && (
                      <button
                        type="button"
                        onClick={() => handleThumbnailPick(null)}
                        className="mt-1 text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={thumbnailInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      handleThumbnailPick(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              {/* Name + Sport */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Title *</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={tournamentForm.name}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Summer Hoops Classic"
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Sport *</label>
                  <select
                    required
                    value={tournamentForm.sport}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, sport: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  >
                    {SPORTS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>

              {/* Basketball code. Offered only for basketball, and only at
                  creation: it fixes what a basket is worth, how a game ends and
                  which ranking board the tournament scores on, so changing it
                  after fixtures exist would re-score played games. */}
              {tournamentForm.sport === 'BASKETBALL' && (
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Format *</label>
                  <select
                    required
                    value={tournamentForm.variant}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, variant: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  >
                    <option value="FIVE_V_FIVE">5v5 — full court, 4 quarters</option>
                    <option value="THREE_X_THREE">3x3 — half court, first to 21</option>
                  </select>
                  <p className="text-xs text-gray-custom mt-1.5">
                    {tournamentForm.variant === 'THREE_X_THREE'
                      ? 'FIBA 3x3: one basket, 1 point inside the arc and 2 behind it, first to 21 or 10 minutes. Ranked on its own board.'
                      : 'FIBA 5v5: full court, 2 and 3 points, four quarters.'}
                  </p>
                  <p className="text-xs text-amber-400/80 mt-1">
                    Cannot be changed after the tournament is created.
                  </p>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={tournamentForm.startDate}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">End Date *</label>
                  <input
                    type="date"
                    required
                    value={tournamentForm.endDate}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-gray-custom mb-2">Description</label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={tournamentForm.description}
                  onChange={(e) => setTournamentForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Format, rules, highlights…"
                  className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm resize-none"
                />
              </div>

              {/* Venue + City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Venue</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={tournamentForm.venue}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, venue: e.target.value }))}
                    placeholder="Arena / ground name"
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">City</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={tournamentForm.city}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Mumbai"
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                  />
                </div>
              </div>

              {/* Fees + Max teams */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Entry Fee</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={tournamentForm.entryFee}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, entryFee: e.target.value }))}
                    placeholder="0"
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Prize Pool</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={tournamentForm.prizePool}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, prizePool: e.target.value }))}
                    placeholder="0"
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Max Teams</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={tournamentForm.maxTeams}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, maxTeams: e.target.value }))}
                    placeholder="16"
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                  />
                </div>
              </div>

              {/* Age + Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Age Category</label>
                  <select
                    value={tournamentForm.ageCategory}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, ageCategory: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  >
                    <option value="">— None —</option>
                    {AGE_CATEGORIES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Gender Category</label>
                  <select
                    value={tournamentForm.genderCategory}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, genderCategory: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  >
                    <option value="">— None —</option>
                    {GENDER_CATEGORIES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              {/* Format + Roster size */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Entry type *</label>
                  <select
                    value={tournamentForm.format}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, format: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                    title="Who registers — teams, solo athletes, or pairs. (The competition format — league / knockout / groups — is chosen later in the Stat Tracker.)"
                  >
                    {TOURNAMENT_FORMATS.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-custom mt-1">Who registers. League/knockout format is set at the draw.</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Min Roster</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    disabled={tournamentForm.format === 'INDIVIDUAL'}
                    value={tournamentForm.minRosterSize}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, minRosterSize: e.target.value }))}
                    placeholder="e.g. 11"
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Max Roster</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    disabled={tournamentForm.format === 'INDIVIDUAL'}
                    value={tournamentForm.maxRosterSize}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, maxRosterSize: e.target.value }))}
                    placeholder="e.g. 18"
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowTournamentForm(false); setTournamentForm(emptyTournamentForm); handleThumbnailPick(null); }}
                  className="px-5 py-2.5 border border-line text-gray-custom hover:text-foreground rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTournamentMutation.isPending}
                  className="flex-1 px-5 py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  {createTournamentMutation.isPending ? 'Creating…' : 'Create Tournament'}
                </button>
              </div>
            </form>
          )}

          {/* Existing tournaments */}
          {tournamentsLoading ? (
            <div className="flex justify-center py-16">
              <BallLoader />
            </div>
          ) : (tournamentsData?.tournaments ?? []).length === 0 ? (
            <div className="bg-card rounded-xl border border-line p-12 text-center">
              <Trophy size={28} className="mx-auto mb-3 text-gray-custom" />
              <p className="text-sm text-gray-custom">No tournaments yet.</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-line overflow-hidden">
              <div className="divide-y divide-line">
                {(tournamentsData.tournaments).map((t: any) => {
                  const isExpanded = expandedTournamentId === t.id;
                  return (
                    <div key={t.id}>
                      <div className="flex items-center gap-4 px-5 py-3 hover:bg-surface/20 transition-colors">
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-surface shrink-0 flex items-center justify-center">
                          {t.thumbnailUrl
                            ? <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-cover" />
                            : <Trophy size={18} className="text-gray-custom" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <p className="text-xs text-gray-custom">
                            {t.sport}
                            {t.format ? ` · ${t.format}` : ''}
                            {t.ageCategory ? ` · ${t.ageCategory}` : ''}
                            {t.genderCategory ? ` · ${t.genderCategory}` : ''}
                            {' · '}
                            {new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-gray-custom border border-line">
                          {t._count?.teams ?? 0} registered
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-gray-custom border border-line">
                          {t.status}
                        </span>
                        <Link
                          to={`/admin/tournaments/${t.id}/manage`}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-on-primary bg-primary hover:bg-primary-dark transition-colors rounded-lg"
                          title="Manage tournament (guided)"
                        >
                          <Activity size={13} /> Manage
                        </Link>
                        <Link
                          to={`/admin/tournaments/${t.id}/provision`}
                          className="flex items-center gap-1 p-1.5 text-xs text-gray-custom hover:text-primary-light transition-colors rounded"
                          title="Bulk provision roster from CSV"
                        >
                          <Upload size={14} />
                        </Link>
                        <button
                          onClick={() => setExpandedTournamentId(isExpanded ? null : t.id)}
                          className="flex items-center gap-1 p-1.5 text-xs text-gray-custom hover:text-foreground transition-colors rounded"
                          title={isExpanded ? 'Hide manage panel' : 'Manage status & registrations'}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <button
                          onClick={() => setDeleteTournament({ id: t.id, name: t.name })}
                          className="p-1.5 text-gray-custom hover:text-red-400 transition-colors rounded"
                          title="Delete tournament"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {isExpanded && (
                        <>
                          <TournamentLifecycle tournament={t} />
                          <TournamentRegistrationsPanel tournamentId={t.id} />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Feed Preview Tab ──────────────────────────────────────── */}
      {tab === 'feed-preview' && (
        <div className="bg-card rounded-xl border border-line p-5">
          <h2 className="font-semibold mb-1 flex items-center gap-2">
            <Eye size={16} className="text-primary-light" />
            Feed Preview by Sport
          </h2>
          <p className="text-sm text-gray-custom mb-5">
            Pick a sport to view the home feed with its sport-specific backdrop. Returns to your normal feed when you exit preview.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SPORTS.map(({ value, label, emoji }) => (
              <Link
                key={value}
                to={`/home?previewSport=${value}`}
                className="flex items-center gap-3 p-4 rounded-lg border border-line hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-2xl">{emoji}</span>
                <span className="font-medium text-sm">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Appeals Tab (moderation) ──────────────────────────────── */}
      {tab === 'appeals' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {([['PENDING', 'Pending'], ['REVIEWING', 'Reviewing'], ['GRANTED', 'Approved'], ['DENIED', 'Denied'], ['', 'All']] as const).map(([value, label]) => (
              <button key={label} onClick={() => setAppealStatus(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${appealStatus === value ? 'bg-primary text-on-primary font-semibold' : 'bg-card text-gray-custom hover:text-foreground border border-line'}`}>
                {label}
              </button>
            ))}
          </div>
          {appealsLoading ? (
            <p className="text-gray-custom text-sm">Loading appeals…</p>
          ) : !appealsData?.appeals?.length ? (
            <div className="bg-card border border-line rounded-xl p-8 text-center">
              <ShieldAlert size={32} className="mx-auto mb-3 text-gray-custom" />
              <p className="text-sm text-gray-custom">No appeals{appealStatus ? ` with status ${appealStatus.toLowerCase()}` : ''}.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {appealsData.appeals.map((a: any) => {
                const sColor = a.status === 'PENDING' ? 'bg-yellow-500/15 text-yellow-400' : a.status === 'REVIEWING' ? 'bg-blue-500/15 text-blue-400' : a.status === 'GRANTED' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400';
                const open = a.status === 'PENDING' || a.status === 'REVIEWING';
                return (
                  <div key={a.id} className="bg-card border border-line rounded-xl p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-elevated text-foreground/80">{a.kind === 'ACCOUNT_SUSPENSION' ? 'Suspension' : 'Content removal'}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${sColor}`}>{a.status}</span>
                      <span className="text-xs text-gray-custom">{new Date(a.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <p className="text-xs text-gray-custom">
                      From <Link to={`/profile/${a.user?.id}`} className="text-primary hover:text-primary-light">{a.user?.name ?? 'Unknown'}</Link>
                      {a.user?.email ? ` · ${a.user.email}` : ''}
                      {a.user?.suspended && <span className="ml-1 text-orange-400">(currently suspended)</span>}
                    </p>
                    {a.subjectLabel && <p className="text-xs text-gray-custom mt-1">Re: <span className="text-foreground/70">{a.subjectLabel}</span></p>}
                    <div className="mt-2 rounded-lg bg-surface border border-line px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-custom mb-1">Their appeal</p>
                      <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words">{a.message}</p>
                    </div>
                    {a.reviewNote && <p className="text-xs text-gray-custom mt-2">Note: {a.reviewNote}</p>}
                    {open && (
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {a.status === 'PENDING' && (
                          <button onClick={() => resolveAppealMutation.mutate({ id: a.id, status: 'REVIEWING' })}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-elevated border border-line text-foreground/80 hover:text-foreground transition-colors">Start review</button>
                        )}
                        <button onClick={() => { const note = prompt('Note (optional, shown to the user):') ?? undefined; resolveAppealMutation.mutate({ id: a.id, status: 'GRANTED', reviewNote: note || undefined }); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
                          <CheckCircle size={13} /> {a.kind === 'ACCOUNT_SUSPENSION' ? 'Approve & lift' : 'Approve'}
                        </button>
                        <button onClick={() => { const note = prompt('Reason for denial (optional, shown to the user):') ?? undefined; resolveAppealMutation.mutate({ id: a.id, status: 'DENIED', reviewNote: note || undefined }); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors">Deny</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── New Profile Tab (single athlete/coach) ────────────────── */}
      {tab === 'new-profile' && (
        <div className="max-w-md">
          <div className="bg-card rounded-xl border border-line p-6">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus size={18} className="text-primary" />
              <h2 className="font-semibold text-lg">Create Athlete Profile</h2>
            </div>
            <p className="text-sm text-gray-custom mb-4">
              Creates a claimable account. The athlete gets a welcome email with login details.
              Under-13 athletes are private by default and require emailed guardian consent before the account activates.
            </p>

            <Link
              to="/admin/provision"
              className="flex items-center justify-between gap-2 mb-6 px-4 py-3 bg-surface border border-line rounded-lg hover:border-primary transition-colors group"
            >
              <span className="flex items-center gap-2 text-sm">
                <Upload size={16} className="text-primary-light" />
                Creating many at once? <span className="text-foreground font-medium">Bulk import from CSV</span>
              </span>
              <ChevronRight size={16} className="text-gray-custom group-hover:text-foreground" />
            </Link>

            <form
              onSubmit={(e) => { e.preventDefault(); if (athleteFormValid) createAthleteMutation.mutate(athleteForm); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm text-gray-custom mb-2">Full Name</label>
                <input
                  type="text" value={athleteForm.name} required maxLength={80}
                  onChange={(e) => setAthleteForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Athlete's full name"
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-custom mb-2">Email <span className="text-gray-custom">(login)</span></label>
                <input
                  type="email" value={athleteForm.email} required
                  onChange={(e) => setAthleteForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="athlete@example.com"
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Role</label>
                  <select
                    value={athleteForm.role}
                    onChange={(e) => setAthleteForm((f) => ({ ...f, role: e.target.value as 'ATHLETE' | 'COACH' }))}
                    className="w-full px-3 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  >
                    <option value="ATHLETE">Athlete</option>
                    <option value="COACH">Coach</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Sport</label>
                  <select
                    value={athleteForm.sport} required
                    onChange={(e) => setAthleteForm((f) => ({ ...f, sport: e.target.value }))}
                    className="w-full px-3 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  >
                    <option value="">Select sport</option>
                    {SPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">
                    Date of Birth {athleteDobRequired && <span className="text-primary">*</span>}
                  </label>
                  <input
                    type="date" value={athleteForm.dateOfBirth} required={athleteDobRequired}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setAthleteForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    className="w-full px-3 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  />
                  {athleteAge !== null && (
                    <p className="mt-1 text-xs text-gray-custom">Age {athleteAge}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Gender</label>
                  <select
                    value={athleteForm.gender}
                    onChange={(e) => setAthleteForm((f) => ({ ...f, gender: e.target.value as '' | 'MALE' | 'FEMALE' }))}
                    className="w-full px-3 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  >
                    <option value="">—</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Position</label>
                  <input
                    type="text" value={athleteForm.position} maxLength={60}
                    onChange={(e) => setAthleteForm((f) => ({ ...f, position: e.target.value }))}
                    placeholder="e.g. Point Guard"
                    className="w-full px-3 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Phone</label>
                  <input
                    type="tel" value={athleteForm.phone} maxLength={40}
                    onChange={(e) => setAthleteForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Optional"
                    className="w-full px-3 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                  />
                </div>
              </div>

              {/* Guardian email — required and surfaced only for under-13 athletes */}
              {athleteUnder13 && (
                <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/5 p-4">
                  <label className="block text-sm font-medium text-yellow-300 mb-2">
                    Guardian Email <span className="text-primary">*</span>
                  </label>
                  <input
                    type="email" value={athleteForm.guardianEmail} required
                    onChange={(e) => setAthleteForm((f) => ({ ...f, guardianEmail: e.target.value }))}
                    placeholder="parent@example.com"
                    className="w-full px-3 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                  />
                  <p className="mt-2 text-xs text-yellow-200/70">
                    This athlete is under 13. The account stays private and inactive until the guardian
                    consents via an emailed link — they'll then receive the login details.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={!athleteFormValid || createAthleteMutation.isPending}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {createAthleteMutation.isPending ? 'Creating…' : 'Create Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Link Profile Tab (bind an identity to an unclaimed profile) ── */}
      {tab === 'link-profile' && (
        <div>
          <div className="bg-card rounded-xl border border-line p-5 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <Link2 size={18} className="text-primary" />
              <h2 className="font-semibold text-lg">Link an Unclaimed Profile</h2>
            </div>
            <p className="text-sm text-gray-custom">
              A player rostered without an email lives on as an unclaimed profile — real stats, real ranking,
              no login. They normally take it over with a claim code. Link one here when that can't happen:
              the slip was lost, or there was never an email to send it to. Everything already recorded on the
              profile stays on it.
            </p>
          </div>

          <div className="flex gap-3 mb-4 flex-wrap">
            <input
              value={unclaimedSearch}
              onChange={(e) => { setUnclaimedSearch(e.target.value); setUnclaimedPage(1); }}
              placeholder="Search by name or position..."
              className="flex-1 min-w-48 bg-card border border-line rounded-lg px-3 py-2 text-sm text-foreground placeholder-gray-custom focus:outline-none focus:border-primary"
            />
            <select
              value={unclaimedSport}
              onChange={(e) => { setUnclaimedSport(e.target.value); setUnclaimedPage(1); }}
              className="bg-card border border-line rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">All sports</option>
              {SPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {unclaimedLoading ? (
            <div className="flex justify-center py-16">
              <BallLoader />
            </div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
              {/* Stranded profiles */}
              <div className="bg-card rounded-xl border border-line overflow-hidden">
                <div className="divide-y divide-line">
                  {(unclaimedData?.profiles ?? []).length === 0 ? (
                    <div className="p-10 text-center text-gray-custom text-sm">
                      No unclaimed profiles{unclaimedSearch || unclaimedSport ? ' match those filters' : ' on the network'}.
                    </div>
                  ) : (unclaimedData?.profiles ?? []).map((p: any) => {
                    const age = unclaimedAge(p);
                    const selected = linkTarget?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setLinkTarget(p); setLinkForm(EMPTY_LINK_FORM); }}
                        className={`w-full text-left px-5 py-3 flex items-center gap-3 transition-colors ${
                          selected ? 'bg-primary/10' : 'hover:bg-surface/20'
                        }`}
                      >
                        <Avatar name={p.name} src={p.avatar} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {p.name}
                            {p.guardianManaged && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400/15 text-yellow-300 align-middle">
                                Under 13
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-custom truncate">
                            {[
                              p.role === 'COACH' ? 'Coach' : 'Athlete',
                              p.sport,
                              p.position,
                              age !== null ? `Age ${age}` : null,
                            ].filter(Boolean).join(' · ')}
                          </p>
                          {p.teams.length > 0 && (
                            <p className="text-xs text-gray-custom truncate mt-0.5">
                              {p.teams.map((t: any) => `${t.teamName} (${t.tournamentName})`).join(', ')}
                            </p>
                          )}
                        </div>
                        {/* What would be handed over — the reason linking matters. */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{p.gamesRecorded}</p>
                          <p className="text-[10px] text-gray-custom uppercase tracking-wide">
                            {p.gamesRecorded === 1 ? 'game' : 'games'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {unclaimedData?.total > 20 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-line">
                    <span className="text-xs text-gray-custom">{unclaimedData.total} unclaimed</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setUnclaimedPage((p) => Math.max(1, p - 1))}
                        disabled={unclaimedPage === 1}
                        className="px-3 py-1 text-sm text-gray-custom hover:text-foreground disabled:opacity-40 border border-line rounded-lg"
                      >
                        Prev
                      </button>
                      <span className="px-3 py-1 text-sm">Page {unclaimedPage}</span>
                      <button
                        onClick={() => setUnclaimedPage((p) => p + 1)}
                        disabled={unclaimedPage * 20 >= unclaimedData.total}
                        className="px-3 py-1 text-sm text-gray-custom hover:text-foreground disabled:opacity-40 border border-line rounded-lg"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Link panel */}
              <div className="bg-card rounded-xl border border-line p-5 lg:sticky lg:top-4">
                {!linkTarget ? (
                  <p className="text-sm text-gray-custom py-6 text-center">
                    Pick a profile to link it to someone.
                  </p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!linkFormValid) return;
                      linkProfileMutation.mutate({
                        id: linkTarget.id,
                        email: linkForm.email,
                        guardianEmail: linkForm.guardianEmail,
                      });
                    }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={linkTarget.name} src={linkTarget.avatar} size={40} />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{linkTarget.name}</p>
                        <p className="text-xs text-gray-custom truncate">
                          {[linkTarget.sport, linkTarget.position].filter(Boolean).join(' · ') || 'Unclaimed profile'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-custom mb-2">
                        {linkTargetUnder13 ? "Athlete's email " : 'Email '}
                        <span className="text-gray-custom">(login)</span>
                      </label>
                      <input
                        type="email" value={linkForm.email} required autoFocus
                        onChange={(e) => setLinkForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="player@example.com"
                        className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                      />
                      <p className="mt-2 text-xs text-gray-custom">
                        If this email already has a login, it's bound to the profile as-is. If not, one is created
                        and a temporary password emailed over.
                      </p>
                    </div>

                    {/* Guardian email — required and surfaced only for under-13 athletes */}
                    {linkTargetUnder13 && (
                      <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/5 p-4">
                        <label className="block text-sm font-medium text-yellow-300 mb-2">
                          Guardian Email <span className="text-primary">*</span>
                        </label>
                        <input
                          type="email" value={linkForm.guardianEmail} required
                          onChange={(e) => setLinkForm((f) => ({ ...f, guardianEmail: e.target.value }))}
                          placeholder="parent@example.com"
                          className="w-full px-3 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                        />
                        <p className="mt-2 text-xs text-yellow-200/70">
                          This athlete is under 13. The profile stays private and no login is handed out until the
                          guardian consents via an emailed link — they'll get the login details then.
                        </p>
                      </div>
                    )}

                    <div className="rounded-lg border border-line bg-surface/40 p-3">
                      <p className="text-xs text-gray-custom">
                        Linking is not reversible from here. Any claim code still floating around for this profile
                        stops working, and {linkTarget.gamesRecorded > 0
                          ? `${linkTarget.gamesRecorded} recorded ${linkTarget.gamesRecorded === 1 ? 'game' : 'games'} plus every roster spot and ranking`
                          : 'every roster spot and ranking'} moves under this login.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setLinkTarget(null); setLinkForm(EMPTY_LINK_FORM); }}
                        className="px-4 py-3 bg-elevated hover:bg-card border border-line rounded-lg text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!linkFormValid || linkProfileMutation.isPending}
                        className="flex-1 py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50 text-sm"
                      >
                        {linkProfileMutation.isPending ? 'Linking…' : 'Link Profile'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Teams Tab (create + manage members) ────────────────────── */}
      {tab === 'new-team' && (
        <div>
          <div className="flex gap-2 mb-5 flex-wrap">
            {([
              ['empty',   'Create team'],
              ['compose', 'Create with players'],
              ['manage',  'Manage members'],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setTeamMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  teamMode === m
                    ? 'bg-primary text-on-primary font-semibold'
                    : 'bg-card text-gray-custom hover:text-foreground border border-line'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {teamMode === 'compose' && <ComposeTeamForm />}
          {teamMode === 'manage' && <ManageTeams />}

          {teamMode === 'empty' && (
          <div className="max-w-md">
          <div className="bg-card rounded-xl border border-line p-6">
            <div className="flex items-center gap-2 mb-1">
              <Crown size={18} className="text-amber-400" />
              <h2 className="font-semibold text-lg">Create Team</h2>
            </div>
            <p className="text-sm text-gray-custom mb-6">
              Creates a team with an existing profile as captain. Pick a tournament to create and register
              the team there in one step, or leave it standalone. The captain is added as an accepted
              member — no invite is sent.
            </p>

            <form
              onSubmit={(e) => { e.preventDefault(); if (teamFormValid) createTeamMutation.mutate(teamForm); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm text-gray-custom mb-2">Team Name</label>
                <input
                  type="text" value={teamForm.name} required maxLength={120}
                  onChange={(e) => setTeamForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Downtown Warriors"
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-custom mb-2">Tournament <span className="text-gray-custom/70">(optional)</span></label>
                <select
                  value={teamForm.tournamentId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const t = (tournamentsData?.tournaments ?? []).find((x: any) => x.id === id);
                    // A tournament team inherits the tournament's sport.
                    setTeamForm((f) => ({ ...f, tournamentId: id, ...(t && { sport: t.sport }) }));
                  }}
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                >
                  <option value="">None — standalone team</option>
                  {(tournamentsData?.tournaments ?? []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-custom mt-1">
                  {teamForm.tournamentId
                    ? 'The team is created in this tournament and registered to it.'
                    : 'You can register a standalone team to a tournament later.'}
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-custom mb-2">Sport</label>
                <select
                  value={teamForm.sport} required disabled={!!teamForm.tournamentId}
                  onChange={(e) => setTeamForm((f) => ({ ...f, sport: e.target.value }))}
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm disabled:opacity-60"
                >
                  {SPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {!!teamForm.tournamentId && (
                  <p className="text-xs text-gray-custom mt-1">Inherited from the tournament.</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-custom mb-2">Captain</label>
                {selectedCaptain ? (
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-surface border border-line rounded-lg">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CaptainAvatar name={selectedCaptain.name} avatar={selectedCaptain.avatar} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{selectedCaptain.name}</p>
                        <p className="text-xs text-gray-custom truncate">{selectedCaptain.email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedCaptain(null); setTeamForm((f) => ({ ...f, captainId: '' })); }}
                      className="text-gray-custom hover:text-foreground shrink-0"
                      aria-label="Clear captain"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text" value={captainQuery}
                      onChange={(e) => setCaptainQuery(e.target.value)}
                      placeholder="Search existing profiles by name…"
                      className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                    />
                    {captainQuery.trim().length >= 2 && (
                      <div className="mt-2 border border-line rounded-lg divide-y divide-line overflow-hidden">
                        {captainResults.isLoading ? (
                          <p className="px-3 py-2.5 text-xs text-gray-custom">Searching…</p>
                        ) : (captainResults.data?.length ?? 0) === 0 ? (
                          <p className="px-3 py-2.5 text-xs text-gray-custom">No matching profiles. Create one in “New Profile” first.</p>
                        ) : (
                          captainResults.data!.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => { setSelectedCaptain(u); setTeamForm((f) => ({ ...f, captainId: u.id })); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface transition-colors"
                            >
                              <CaptainAvatar name={u.name} avatar={u.avatar} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{u.name}</p>
                                <p className="text-xs text-gray-custom truncate">{u.email}</p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-custom mt-1">Every team needs a captain. Pick an existing athlete or coach.</p>
                  </>
                )}
              </div>

              <button
                type="submit"
                disabled={!teamFormValid || createTeamMutation.isPending}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {createTeamMutation.isPending ? 'Creating…' : 'Create Team'}
              </button>
            </form>
          </div>
          </div>
          )}
        </div>
      )}

      {/* ── Create Admin Tab ──────────────────────────────────────── */}
      {tab === 'create-admin' && (
        <div className="max-w-md">
          <div className="bg-card rounded-xl border border-line p-6">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus size={18} className="text-purple-400" />
              <h2 className="font-semibold text-lg">Create Admin Account</h2>
            </div>
            <p className="text-sm text-gray-custom mb-6">
              Creates a new admin account that can log in immediately. Admin accounts bypass email verification.
            </p>

            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-custom mb-2">Full Name</label>
                <input
                  type="text"
                  value={adminForm.name}
                  onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  maxLength={50}
                  placeholder="e.g. Tournament Director"
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-custom mb-2">Email Address</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                  required
                  placeholder="admin@example.com"
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-custom mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={adminForm.password}
                    onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
                    required
                    minLength={8}
                    placeholder="Min 8 chars, upper + lower + number"
                    className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom text-sm pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-custom hover:text-foreground transition-colors"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-custom">
                  Must include at least one uppercase letter, one lowercase letter, and one number.
                </p>
              </div>

              <button
                type="submit"
                disabled={createAdminMutation.isPending}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {createAdminMutation.isPending ? 'Creating...' : 'Create Admin Account'}
              </button>
            </form>
          </div>

          <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-xs text-yellow-300 font-medium mb-1">First-time setup?</p>
            <p className="text-xs text-yellow-200/70">
              To create the very first admin account before anyone is logged in, run from the server directory:
            </p>
            <code className="block mt-2 text-xs bg-surface/60 rounded px-3 py-2 text-yellow-100 font-mono break-all">
              npm run create-admin
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small round avatar with an initial fallback — used in the captain picker. */
function CaptainAvatar({ name, avatar }: { name: string; avatar: string | null }) {
  return <Avatar name={name} src={avatar} size={32} />;
}

// ─── Step 4: compose + member management ─────────────────────────────────────

type NewMemberDraft = { name: string; email: string; dateOfBirth: string; guardianEmail: string };
const EMPTY_MEMBER: NewMemberDraft = { name: '', email: '', dateOfBirth: '', guardianEmail: '' };

type AdminTeamMember = {
  role: 'CAPTAIN' | 'PLAYER' | 'COACH';
  status: string;
  user: { id: string; name: string; avatar: string | null; role: string };
};
type AdminTeam = {
  id: string; name: string; sport: string;
  captainId: string; coachId: string | null; tournamentId: string | null;
  tournament: { id: string; name: string } | null;
  members: AdminTeamMember[];
};

/** Whole years between a date string (YYYY-MM-DD) and today, or null. */
function ageFromDateString(s: string): number | null {
  if (!s) return null;
  const dob = new Date(s);
  if (Number.isNaN(dob.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - dob.getFullYear();
  const m = t.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < dob.getDate())) a--;
  return a;
}

/** A new athlete member is valid with name + email + DOB, and a guardian email if under 13. */
function newMemberValid(m: NewMemberDraft): boolean {
  if (!m.name.trim() || !m.email.trim() || !m.dateOfBirth) return false;
  const age = ageFromDateString(m.dateOfBirth);
  if (age !== null && age < 13 && !m.guardianEmail.trim()) return false;
  return true;
}

/** Name + email + DOB fields for a new athlete, revealing a guardian-email field when under 13. */
function NewProfileFields({ value, onChange }: { value: NewMemberDraft; onChange: (v: NewMemberDraft) => void }) {
  const age = ageFromDateString(value.dateOfBirth);
  const under13 = age !== null && age < 13;
  const set = (patch: Partial<NewMemberDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          type="text" value={value.name} maxLength={80} placeholder="Full name"
          onChange={(e) => set({ name: e.target.value })}
          className="px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
        />
        <input
          type="email" value={value.email} maxLength={254} placeholder="Email (login)"
          onChange={(e) => set({ email: e.target.value })}
          className="px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] text-gray-custom mb-1">Date of birth</label>
          <input
            type="date" value={value.dateOfBirth}
            onChange={(e) => set({ dateOfBirth: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
          />
        </div>
        {under13 && (
          <div>
            <label className="block text-[11px] text-amber-300 mb-1">Guardian email (required · under 13)</label>
            <input
              type="email" value={value.guardianEmail} maxLength={254} placeholder="parent@example.com"
              onChange={(e) => set({ guardianEmail: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-amber-500/40 rounded-lg text-sm focus:outline-none focus:border-amber-400 placeholder-gray-custom"
            />
          </div>
        )}
      </div>
      {under13 && (
        <p className="text-[11px] text-amber-300/80">
          Under-13 profile: private by default. A guardian-consent email is sent; the account activates once the guardian consents.
        </p>
      )}
    </div>
  );
}

/** "Create with players" — composes new profiles + team + assignment in one action. */
function ComposeTeamForm() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [sport, setSport] = useState('BASKETBALL');
  const [tournamentId, setTournamentId] = useState('');
  const [captain, setCaptain] = useState<NewMemberDraft>(EMPTY_MEMBER);
  const [players, setPlayers] = useState<NewMemberDraft[]>([]);
  const [coach, setCoach] = useState<{ name: string; email: string }>({ name: '', email: '' });

  // Same key as the Tournaments tab, so the list is shared from the cache.
  const { data: tournamentsData } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data } = await api.get('/tournaments?limit=50');
      return data;
    },
  });

  const compose = useMutation({
    mutationFn: async () => {
      const clean = (m: NewMemberDraft) => ({
        name: m.name.trim(),
        email: m.email.trim(),
        dateOfBirth: m.dateOfBirth,
        ...(m.guardianEmail.trim() && { guardianEmail: m.guardianEmail.trim() }),
      });
      const body: any = { name: name.trim(), sport, captain: clean(captain), players: players.map(clean) };
      if (coach.name.trim() && coach.email.trim()) body.coach = { name: coach.name.trim(), email: coach.email.trim() };
      if (tournamentId) body.tournamentId = tournamentId;
      const { data } = await api.post('/admin/teams/compose', body);
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Team "${data.team.name}" created — ${data.membersAdded} member(s), ${data.accountsCreated} new account(s)` +
          (data.guardianConsentPending ? `, ${data.guardianConsentPending} awaiting guardian consent` : ''),
      );
      setName(''); setTournamentId(''); setCaptain(EMPTY_MEMBER); setPlayers([]); setCoach({ name: '', email: '' });
      qc.invalidateQueries({ queryKey: ['admin-teams'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create team'),
  });

  const coachStarted = !!(coach.name.trim() || coach.email.trim());
  const coachValid = !coachStarted || !!(coach.name.trim() && coach.email.trim());
  const valid = !!(name.trim() && sport && newMemberValid(captain) && players.every(newMemberValid) && coachValid);

  return (
    <div className="max-w-2xl">
      <div className="bg-card rounded-xl border border-line p-6">
        <div className="flex items-center gap-2 mb-1">
          <Users size={18} className="text-primary" />
          <h2 className="font-semibold text-lg">Create Team with Players</h2>
        </div>
        <p className="text-sm text-gray-custom mb-5">
          Creates the team and all its profiles in one step. Every new profile is created through the same safety
          path — DOB is required, and under-13s are private and need emailed guardian consent before activating.
        </p>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-custom mb-2">Team Name</label>
              <input
                type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Downtown Warriors"
                className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-custom mb-2">Sport</label>
              <select
                value={sport} disabled={!!tournamentId} onChange={(e) => setSport(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary disabled:opacity-60"
              >
                {SPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-custom mb-2">Tournament <span className="text-gray-custom/70">(optional)</span></label>
            <select
              value={tournamentId}
              onChange={(e) => {
                const id = e.target.value;
                setTournamentId(id);
                // A tournament team inherits the tournament's sport.
                const t = (tournamentsData?.tournaments ?? []).find((x: any) => x.id === id);
                if (t) setSport(t.sport);
              }}
              className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
            >
              <option value="">None — standalone team</option>
              {(tournamentsData?.tournaments ?? []).map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-custom mt-1">
              {tournamentId
                ? 'The team is created in this tournament and registered to it. Sport is inherited.'
                : 'You can register a standalone team to a tournament later.'}
            </p>
          </div>

          <div className="border border-line rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-3 text-sm font-medium">
              <Crown size={14} className="text-amber-400" /> Captain
            </div>
            <NewProfileFields value={captain} onChange={setCaptain} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Players <span className="text-gray-custom font-normal">({players.length})</span></span>
              <button
                type="button" onClick={() => setPlayers((p) => [...p, { ...EMPTY_MEMBER }])}
                className="inline-flex items-center gap-1.5 text-xs text-primary-light hover:underline"
              >
                <Plus size={13} /> Add player
              </button>
            </div>
            <div className="space-y-3">
              {players.map((p, i) => (
                <div key={i} className="border border-line rounded-lg p-4 relative">
                  <button
                    type="button" onClick={() => setPlayers((arr) => arr.filter((_, j) => j !== i))}
                    className="absolute top-3 right-3 text-gray-custom hover:text-red-400" aria-label="Remove player"
                  >
                    <Trash2 size={14} />
                  </button>
                  <p className="text-xs text-gray-custom mb-2">Player {i + 1}</p>
                  <NewProfileFields value={p} onChange={(v) => setPlayers((arr) => arr.map((x, j) => (j === i ? v : x)))} />
                </div>
              ))}
              {players.length === 0 && (
                <p className="text-xs text-gray-custom">
                  No players yet — add players above, or create the team with just a captain and add members later.
                </p>
              )}
            </div>
          </div>

          <div className="border border-line rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-3 text-sm font-medium">
              <Award size={14} className="text-primary-light" /> Coach <span className="text-gray-custom font-normal">(optional)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text" value={coach.name} maxLength={80} placeholder="Coach name"
                onChange={(e) => setCoach((c) => ({ ...c, name: e.target.value }))}
                className="px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
              />
              <input
                type="email" value={coach.email} maxLength={254} placeholder="Coach email"
                onChange={(e) => setCoach((c) => ({ ...c, email: e.target.value }))}
                className="px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
              />
            </div>
            <p className="text-[11px] text-gray-custom mt-1.5">Coaches are adults — no date of birth needed.</p>
          </div>

          <button
            type="button" onClick={() => compose.mutate()} disabled={!valid || compose.isPending}
            className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50 text-sm"
          >
            {compose.isPending ? 'Creating…' : 'Create team & profiles'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Manage members" — list teams, expand one to add/remove members (admin authority). */
function ManageTeams() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const teams = useQuery({
    queryKey: ['admin-teams', search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      const { data } = await api.get(`/admin/teams?${params}`);
      return data.teams as AdminTeam[];
    },
  });

  const removeMember = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      api.delete(`/admin/teams/${teamId}/members/${userId}`),
    onSuccess: () => { toast.success('Member removed'); qc.invalidateQueries({ queryKey: ['admin-teams'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to remove member'),
  });

  const deleteTeam = useMutation({
    mutationFn: (teamId: string) => api.delete(`/admin/teams/${teamId}`),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Team deleted');
      setExpanded(null);
      qc.invalidateQueries({ queryKey: ['admin-teams'] });
    },
    // The server refuses a team that has matches or a tracker draw, and says
    // exactly why — surface that rather than a generic failure.
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete team', { duration: 6000 }),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <input
        value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams by name…"
        className="w-full bg-card border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
      />

      {teams.isLoading ? (
        <p className="text-sm text-gray-custom">Loading teams…</p>
      ) : (teams.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-gray-custom">No teams found.</p>
      ) : (
        <div className="space-y-3">
          {teams.data!.map((t) => (
            <div key={t.id} className="bg-card rounded-xl border border-line overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-gray-custom">
                    {t.sport} · {t.members.length} member(s) · {t.tournament ? t.tournament.name : 'Standalone'}
                  </p>
                </div>
                {expanded === t.id
                  ? <ChevronUp size={16} className="text-gray-custom shrink-0" />
                  : <ChevronDown size={16} className="text-gray-custom shrink-0" />}
              </button>

              {expanded === t.id && (
                <div className="border-t border-line p-4 space-y-3">
                  <div className="divide-y divide-line">
                    {t.members.map((m) => (
                      <div key={m.user.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CaptainAvatar name={m.user.name} avatar={m.user.avatar} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{m.user.name}</p>
                            <p className="text-xs text-gray-custom">
                              {m.role === 'CAPTAIN' ? 'Captain' : m.role === 'COACH' ? 'Coach' : 'Player'}
                              {m.status !== 'ACCEPTED' && ` · ${m.status.toLowerCase()}`}
                            </p>
                          </div>
                        </div>
                        {m.user.id === t.captainId ? (
                          <span className="text-[11px] text-amber-400 shrink-0 inline-flex items-center gap-1"><Crown size={11} /> captain</span>
                        ) : (
                          <button
                            onClick={() => removeMember.mutate({ teamId: t.id, userId: m.user.id })}
                            disabled={removeMember.isPending}
                            className="text-gray-custom hover:text-red-400 shrink-0 disabled:opacity-50" aria-label="Remove member"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <AddMemberRow teamId={t.id} />

                  <div className="border-t border-line pt-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-custom">Delete this team</p>
                      <p className="text-[11px] text-gray-custom/70 mt-0.5">
                        Removes the team and its roster. Blocked once it has recorded matches.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Delete “${t.name}”? Its ${t.members.length} roster entr${t.members.length === 1 ? 'y' : 'ies'} go with it. This cannot be undone.`)) {
                          deleteTeam.mutate(t.id);
                        }
                      }}
                      disabled={deleteTeam.isPending}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                      {deleteTeam.isPending && deleteTeam.variables === t.id ? 'Deleting…' : 'Delete team'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Search an existing profile and add it to a team as PLAYER or COACH (admin authority). */
function AddMemberRow({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'PLAYER' | 'COACH'>('PLAYER');
  const [picked, setPicked] = useState<CaptainPick | null>(null);

  const results = useQuery({
    queryKey: ['admin-member-search', query],
    queryFn: async () => {
      const params = new URLSearchParams({ search: query.trim(), limit: '6' });
      const { data } = await api.get(`/admin/users?${params}`);
      return ((data.users ?? []) as any[])
        .filter((u) => u.role !== 'ADMIN')
        .map((u) => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar ?? null })) as CaptainPick[];
    },
    enabled: query.trim().length >= 2 && !picked,
  });

  const add = useMutation({
    mutationFn: () => api.post(`/admin/teams/${teamId}/members`, { userId: picked!.id, role }),
    onSuccess: () => {
      toast.success('Member added');
      setQuery(''); setPicked(null); setRole('PLAYER');
      qc.invalidateQueries({ queryKey: ['admin-teams'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add member'),
  });

  return (
    <div className="border-t border-line pt-3">
      <p className="text-xs font-medium text-gray-custom mb-2">Add an existing profile</p>
      {picked ? (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-surface border border-line rounded-lg min-w-0">
            <CaptainAvatar name={picked.name} avatar={picked.avatar} />
            <span className="text-sm truncate">{picked.name}</span>
            <button onClick={() => setPicked(null)} className="text-gray-custom hover:text-foreground" aria-label="Clear"><Trash2 size={13} /></button>
          </div>
          <select
            value={role} onChange={(e) => setRole(e.target.value as 'PLAYER' | 'COACH')}
            className="px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            <option value="PLAYER">Player</option>
            <option value="COACH">Coach</option>
          </select>
          <button
            onClick={() => add.mutate()} disabled={add.isPending}
            className="px-4 py-2 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm disabled:opacity-50"
          >
            {add.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      ) : (
        <>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search profiles by name…"
            className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
          />
          {query.trim().length >= 2 && (
            <div className="mt-2 border border-line rounded-lg divide-y divide-line overflow-hidden">
              {results.isLoading ? (
                <p className="px-3 py-2 text-xs text-gray-custom">Searching…</p>
              ) : (results.data?.length ?? 0) === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-custom">No matching profiles.</p>
              ) : (
                results.data!.map((u) => (
                  <button
                    key={u.id} onClick={() => setPicked(u)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface transition-colors"
                  >
                    <CaptainAvatar name={u.name} avatar={u.avatar} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-gray-custom truncate">{u.email}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useRef } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { Shield, Users, BarChart3, CheckCircle, Trash2, UserPlus, Trophy, Plus, Upload, Eye, ChevronDown, ChevronUp, Crown, Award, Activity, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { SPORTS } from '../data/sports';
import { SportIcon } from '../components/SportIcon';

type Tab = 'users' | 'stats' | 'create-admin' | 'tournaments' | 'feed-preview';

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
  name: '', sport: 'BASKETBALL', description: '', venue: '', city: '',
  startDate: '', endDate: '', entryFee: '', prizePool: '', maxTeams: '',
  ageCategory: '', genderCategory: '',
  format: 'TEAM', minRosterSize: '', maxRosterSize: '',
};


function TournamentRegistrationsPanel({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-tournament-registrations', tournamentId],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${tournamentId}/registrations`);
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="px-5 py-4 bg-surface/30 flex justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const registrations: any[] = data?.registrations ?? [];
  if (registrations.length === 0) {
    return (
      <div className="px-5 py-4 bg-surface/30 text-xs text-gray-custom">
        No teams have registered yet.
      </div>
    );
  }

  return (
    <div className="px-5 py-4 bg-surface/30 space-y-3">
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

            <div className="border-t border-line pt-3 space-y-1.5">
              {team.members.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {m.user.avatar
                      ? <img src={m.user.avatar} alt={m.user.name} className="w-5 h-5 rounded-full object-cover" />
                      : <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary-light">{m.user.name?.charAt(0).toUpperCase()}</div>}
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
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('users');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  // Create-admin form state
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  // Tournament form state
  const [tournamentForm, setTournamentForm] = useState<TournamentForm>(emptyTournamentForm);
  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [expandedTournamentId, setExpandedTournamentId] = useState<string | null>(null);

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('Role updated'); },
    onError: () => toast.error('Failed to update role'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User deleted'); },
    onError: () => toast.error('Delete failed'),
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

  // ─── Tournaments ──────────────────────────────────────────────

  const { data: tournamentsData, isLoading: tournamentsLoading } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data } = await api.get('/tournaments?limit=50');
      return data;
    },
    enabled: tab === 'tournaments',
  });

  const createTournamentMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('name', tournamentForm.name);
      fd.append('sport', tournamentForm.sport);
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

  const deleteTournamentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tournaments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
      toast.success('Tournament deleted');
    },
    onError: () => toast.error('Delete failed'),
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
          ['users',        'Users',         Users],
          ['stats',        'Platform Stats', BarChart3],
          ['tournaments',  'Tournaments',    Trophy],
          ['feed-preview', 'Feed Preview',   Eye],
          ['create-admin', 'Create Admin',   UserPlus],
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
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                      <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                        {u.avatar
                          ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                          : u.name?.charAt(0)}
                      </div>
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
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                  <label className="block text-sm text-gray-custom mb-2">Format *</label>
                  <select
                    value={tournamentForm.format}
                    onChange={(e) => setTournamentForm((f) => ({ ...f, format: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground text-sm"
                  >
                    {TOURNAMENT_FORMATS.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
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
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                        <button
                          onClick={() => setExpandedTournamentId(isExpanded ? null : t.id)}
                          className="flex items-center gap-1 p-1.5 text-xs text-gray-custom hover:text-foreground transition-colors rounded"
                          title={isExpanded ? 'Hide registrations' : 'View registrations'}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${t.name}? This cannot be undone.`)) {
                              deleteTournamentMutation.mutate(t.id);
                            }
                          }}
                          className="p-1.5 text-gray-custom hover:text-red-400 transition-colors rounded"
                          title="Delete tournament"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {isExpanded && <TournamentRegistrationsPanel tournamentId={t.id} />}
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
            {SPORTS.map(({ value, label }) => (
              <Link
                key={value}
                to={`/home?previewSport=${value}`}
                className="flex items-center gap-3 p-4 rounded-lg border border-line hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <SportIcon sport={value} className="text-2xl" />
                <span className="font-medium text-sm">{label}</span>
              </Link>
            ))}
          </div>
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

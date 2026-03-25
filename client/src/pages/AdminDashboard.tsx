import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { Shield, Users, BarChart3, CheckCircle, Trash2, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

type Tab = 'users' | 'stats' | 'create-admin';


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

  // Redirect non-admins at the route level
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;

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

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          ['users',        'Users',         Users],
          ['stats',        'Platform Stats', BarChart3],
          ['create-admin', 'Create Admin',   UserPlus],
        ] as const).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-primary text-dark font-semibold'
                : 'bg-dark-light text-gray-custom hover:text-white border border-dark-lighter'
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
              className="flex-1 min-w-48 bg-dark-light border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
            />
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="bg-dark-light border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
            >
              <option value="">All Roles</option>
              <option value="ATHLETE">Athlete</option>
              <option value="COACH">Coach</option>
              <option value="SCOUT">Scout</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          {usersLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-dark-light rounded-xl border border-dark-lighter overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-dark-lighter text-xs text-gray-custom font-medium">
                <div className="col-span-4">User</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Sport</div>
                <div className="col-span-2">Verified</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="divide-y divide-dark-lighter">
                {users.length === 0 ? (
                  <div className="p-10 text-center text-gray-custom text-sm">No users found</div>
                ) : users.map((u: any) => (
                  <div key={u.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-dark/20 transition-colors">
                    {/* User */}
                    <div className="col-span-4 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-dark-lighter flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
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
                        className="bg-dark border border-dark-lighter rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-primary"
                      >
                        <option value="ATHLETE">Athlete</option>
                        <option value="COACH">Coach</option>
                        <option value="SCOUT">Scout</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>

                    {/* Sport */}
                    <div className="col-span-2 text-xs text-gray-custom">{u.sport}</div>

                    {/* Verified */}
                    <div className="col-span-2">
                      <button
                        onClick={() => verifyMutation.mutate({ id: u.id, verified: !u.verified })}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-colors ${
                          u.verified
                            ? 'bg-accent/20 text-accent hover:bg-red-500/20 hover:text-red-400'
                            : 'bg-dark text-gray-custom hover:bg-accent/20 hover:text-accent border border-dark-lighter'
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
                <div className="flex items-center justify-between px-5 py-3 border-t border-dark-lighter">
                  <span className="text-xs text-gray-custom">{usersData.total} total users</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 text-sm text-gray-custom hover:text-white disabled:opacity-40 border border-dark-lighter rounded-lg"
                    >
                      Prev
                    </button>
                    <span className="px-3 py-1 text-sm">Page {page}</span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page * 20 >= usersData.total}
                      className="px-3 py-1 text-sm text-gray-custom hover:text-white disabled:opacity-40 border border-dark-lighter rounded-lg"
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Users', value: stats.totalUsers, color: 'text-primary-light' },
                  { label: 'Athletes',    value: stats.athletes,   color: 'text-white' },
                  { label: 'Coaches',     value: stats.coaches,    color: 'text-secondary' },
                  { label: 'Scouts',      value: stats.scouts,     color: 'text-accent' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-dark-light rounded-xl border border-dark-lighter p-5 text-center">
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
                  <div key={label} className="bg-dark-light rounded-xl border border-dark-lighter p-5 text-center">
                    <p className="text-3xl font-bold text-white">{value ?? 0}</p>
                    <p className="text-sm text-gray-custom mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {stats.bySport && (
                <div className="bg-dark-light rounded-xl border border-dark-lighter p-5">
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
                          <div className="w-full bg-dark rounded-full h-2">
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

      {/* ── Create Admin Tab ──────────────────────────────────────── */}
      {tab === 'create-admin' && (
        <div className="max-w-md">
          <div className="bg-dark-light rounded-xl border border-dark-lighter p-6">
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
                  className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white placeholder-gray-custom text-sm"
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
                  className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white placeholder-gray-custom text-sm"
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
                    className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white placeholder-gray-custom text-sm pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-custom hover:text-white transition-colors"
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
            <code className="block mt-2 text-xs bg-dark/60 rounded px-3 py-2 text-yellow-100 font-mono break-all">
              npm run create-admin
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

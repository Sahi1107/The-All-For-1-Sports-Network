import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { Users, Plus, X, LogIn, LogOut, Crown } from 'lucide-react';
import toast from 'react-hot-toast';

const SPORT_ICONS: Record<string, string> = {
  BASKETBALL: '🏀',
  FOOTBALL: '⚽',
  CRICKET: '🏏',
};

export default function Teams() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [tab, setTab] = useState<'all' | 'mine'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['teams', tab],
    queryFn: async () => {
      const url = tab === 'mine' ? '/teams?mine=true' : '/teams';
      const { data } = await api.get(url);
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/teams', { ...form, sport: user?.sport }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team created!');
      setShowCreate(false);
      setForm({ name: '', description: '' });
    },
    onError: () => toast.error('Failed to create team'),
  });

  const joinMutation = useMutation({
    mutationFn: (teamId: string) => api.post(`/teams/${teamId}/join`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Joined team!');
    },
    onError: () => toast.error('Could not join'),
  });

  const leaveMutation = useMutation({
    mutationFn: (teamId: string) => api.delete(`/teams/${teamId}/leave`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Left team');
    },
    onError: () => toast.error('Could not leave'),
  });

  const teams = data?.teams ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Teams</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-dark font-semibold text-sm rounded-lg transition-colors"
        >
          <Plus size={16} />
          Create Team
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['all', 'mine'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-primary text-dark font-semibold' : 'bg-dark-light text-gray-custom hover:text-white border border-dark-lighter'
            }`}
          >
            {t === 'all' ? 'All Teams' : 'My Teams'}
          </button>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-light rounded-xl border border-dark-lighter w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-dark-lighter">
              <h2 className="font-semibold">Create Team</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-custom hover:text-white"><X size={18} /></button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
              className="p-5 space-y-4"
            >
              <input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                required
                placeholder="Team name *"
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional)"
                rows={3}
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary resize-none"
              />
              <div className="flex items-center gap-2 text-sm text-gray-custom">
                <span>Sport:</span>
                <span className="text-white">{SPORT_ICONS[user?.sport ?? '']} {user?.sport}</span>
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-dark font-semibold rounded-lg transition-colors"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Team'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Teams Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : teams.length === 0 ? (
        <div className="bg-dark-light rounded-xl border border-dark-lighter p-16 text-center">
          <Users size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">{tab === 'mine' ? "You haven't joined any teams yet." : 'No teams found.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team: any) => {
            const isMember = team.members?.some((m: any) => m.userId === user?.id);
            const isOwner = team.ownerId === user?.id;
            return (
              <div key={team.id} className="bg-dark-light rounded-xl border border-dark-lighter p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{team.name}</h3>
                      {isOwner && <Crown size={13} className="text-secondary" />}
                    </div>
                    <span className="text-xs text-gray-custom">{SPORT_ICONS[team.sport]} {team.sport}</span>
                  </div>
                </div>

                {team.description && (
                  <p className="text-sm text-gray-custom mb-4 line-clamp-2">{team.description}</p>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-custom flex items-center gap-1">
                    <Users size={12} />
                    {team._count?.members ?? 0} members
                  </span>

                  {!isOwner && (
                    isMember ? (
                      <button
                        onClick={() => leaveMutation.mutate(team.id)}
                        disabled={leaveMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark hover:bg-dark-lighter border border-dark-lighter rounded-lg text-gray-custom hover:text-white transition-colors"
                      >
                        <LogOut size={12} /> Leave
                      </button>
                    ) : (
                      <button
                        onClick={() => joinMutation.mutate(team.id)}
                        disabled={joinMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors"
                      >
                        <LogIn size={12} /> Join
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

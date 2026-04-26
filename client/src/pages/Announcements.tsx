import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { Megaphone, Plus, X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const ROLE_COLORS: Record<string, string> = {
  COACH: 'bg-secondary/20 text-secondary',
  SCOUT: 'bg-accent/20 text-accent',
  AGENT: 'bg-amber-500/20 text-amber-400',
};

export default function Announcements() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', sport: user?.sport ?? '' });

  const canPost = user?.role === 'COACH' || user?.role === 'SCOUT' || user?.role === 'AGENT' || user?.role === 'ADMIN';

  const { data, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const { data } = await api.get('/announcements');
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/announcements', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Announcement posted!');
      setShowCreate(false);
      setForm({ title: '', content: '', sport: user?.sport ?? '' });
    },
    onError: () => toast.error('Failed to post'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/announcements/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const announcements = data?.announcements ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Megaphone size={22} className="text-secondary" />
          <h1 className="text-2xl font-bold">Announcements</h1>
        </div>
        {canPost && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-dark font-semibold text-sm rounded-lg transition-colors"
          >
            <Plus size={16} />
            Post Announcement
          </button>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-light rounded-xl border border-dark-lighter w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-dark-lighter">
              <h2 className="font-semibold">New Announcement</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-custom hover:text-white"><X size={18} /></button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
              className="p-5 space-y-4"
            >
              <input
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                required
                placeholder="Announcement title *"
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
              />
              <textarea
                value={form.content}
                onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
                required
                placeholder="Write your announcement..."
                rows={5}
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary resize-none"
              />
              <div>
                <label className="text-xs text-gray-custom mb-1 block">Sport</label>
                <select
                  value={form.sport}
                  onChange={(e) => setForm(f => ({ ...f, sport: e.target.value }))}
                  className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                >
                  <option value="">All Sports</option>
                  <option value="BASKETBALL">Basketball</option>
                  <option value="FOOTBALL">Football</option>
                  <option value="CRICKET">Cricket</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-dark font-semibold rounded-lg transition-colors"
              >
                {createMutation.isPending ? 'Posting...' : 'Post'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Feed */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-dark-light rounded-xl border border-dark-lighter p-16 text-center">
          <Megaphone size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a: any) => (
            <div key={a.id} className="bg-dark-light rounded-xl border border-dark-lighter p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <Link to={`/profile/${a.author?.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="w-9 h-9 rounded-full bg-dark-lighter flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                      {a.author?.avatar
                        ? <img src={a.author.avatar} alt={a.author.name} className="w-full h-full object-cover" />
                        : a.author?.name?.charAt(0)
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium">{a.author?.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[a.author?.role] ?? 'bg-dark text-gray-custom'}`}>
                          {a.author?.role}
                        </span>
                        <span className="text-xs text-gray-custom">{timeAgo(a.createdAt)}</span>
                      </div>
                    </div>
                  </Link>
                </div>

                <div className="flex items-center gap-2">
                  {a.sport && (
                    <span className="text-xs text-gray-custom bg-dark px-2 py-0.5 rounded border border-dark-lighter">{a.sport}</span>
                  )}
                  {(user?.id === a.author?.id || user?.role === 'ADMIN') && (
                    <button
                      onClick={() => { if (confirm('Delete announcement?')) deleteMutation.mutate(a.id); }}
                      className="text-gray-custom hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <h3 className="font-semibold mb-2">{a.title}</h3>
              <p className="text-sm text-gray-custom leading-relaxed whitespace-pre-wrap">{a.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

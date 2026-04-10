import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { UserPlus, UserCheck, UserX, TrendingUp, Handshake } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Grow() {
  const { user: me } = useAuth();
  const qc = useQueryClient();

  // Pending connection requests (incoming)
  const { data: reqData, isLoading: reqLoading } = useQuery({
    queryKey: ['connection-requests'],
    queryFn: async () => {
      const { data } = await api.get('/connections/requests');
      return data;
    },
  });

  // Suggestions
  const { data: sugData, isLoading: sugLoading } = useQuery({
    queryKey: ['suggestions'],
    queryFn: async () => {
      const { data } = await api.get('/connections/suggestions');
      return data;
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => api.put(`/connections/${id}/accept`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connection-requests'] });
      qc.invalidateQueries({ queryKey: ['suggestions'] });
      toast.success('Connection accepted!');
    },
    onError: () => toast.error('Failed to accept'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.put(`/connections/${id}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connection-requests'] });
      toast.success('Request declined');
    },
    onError: () => toast.error('Failed to decline'),
  });

  const followMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/connections/follow/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suggestions'] });
      toast.success('Following!');
    },
    onError: (err: any) => {
      if (err.response?.status === 409) toast.success('Already following');
      else toast.error('Failed to follow');
    },
  });

  const requests = reqData?.requests ?? [];
  const suggestions = sugData?.suggestions ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp size={24} className="text-primary-light" />
        <h1 className="text-2xl font-bold">Grow</h1>
      </div>

      {/* ── Connection Requests ───────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Handshake size={18} className="text-accent" />
          <h2 className="text-lg font-semibold">Connection Requests</h2>
          {requests.length > 0 && (
            <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs font-bold rounded-full">
              {requests.length}
            </span>
          )}
        </div>

        {reqLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-dark-light rounded-xl border border-dark-lighter p-8 text-center">
            <p className="text-gray-custom text-sm">No pending requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r: any) => (
              <div
                key={r.id}
                className="bg-dark-light rounded-xl border border-dark-lighter p-4 flex items-center gap-4"
              >
                <Link to={`/profile/${r.sender.id}`} className="shrink-0">
                  {r.sender.avatar ? (
                    <img src={r.sender.avatar} alt={r.sender.name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary-light">
                      {r.sender.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/profile/${r.sender.id}`} className="font-medium hover:text-primary-light transition-colors">
                    {r.sender.name}
                  </Link>
                  <p className="text-xs text-gray-custom capitalize">
                    {r.sender.role?.toLowerCase()}
                    {r.sender.sport && ` · ${r.sender.sport.toLowerCase()}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => acceptMutation.mutate(r.id)}
                    disabled={acceptMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-dark text-dark font-semibold text-sm rounded-lg transition-colors"
                  >
                    <UserCheck size={14} />
                    Accept
                  </button>
                  <button
                    onClick={() => rejectMutation.mutate(r.id)}
                    disabled={rejectMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-dark-lighter hover:bg-dark border border-dark-lighter text-white text-sm rounded-lg transition-colors"
                  >
                    <UserX size={14} />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Suggestions ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <UserPlus size={18} className="text-primary-light" />
          <h2 className="text-lg font-semibold">People You May Know</h2>
        </div>

        {sugLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="bg-dark-light rounded-xl border border-dark-lighter p-8 text-center">
            <p className="text-gray-custom text-sm">No suggestions right now</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((u: any) => (
              <div
                key={u.id}
                className="bg-dark-light rounded-xl border border-dark-lighter p-4 flex items-center gap-3"
              >
                <Link to={`/profile/${u.id}`} className="shrink-0">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-11 h-11 rounded-full object-cover" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary-light text-sm">
                      {u.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/profile/${u.id}`} className="text-sm font-medium hover:text-primary-light transition-colors truncate block">
                    {u.name}
                  </Link>
                  <p className="text-xs text-gray-custom capitalize truncate">
                    {u.role?.toLowerCase()}
                    {u.sport && ` · ${u.sport.toLowerCase()}`}
                    {u.position && ` · ${u.position}`}
                  </p>
                  {u.location && (
                    <p className="text-xs text-gray-custom truncate">{u.location}</p>
                  )}
                </div>
                <button
                  onClick={() => followMutation.mutate(u.id)}
                  disabled={followMutation.isPending}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-dark font-semibold text-xs rounded-lg transition-colors"
                >
                  <UserPlus size={13} />
                  Follow
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

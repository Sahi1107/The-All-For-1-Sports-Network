import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Bell, Check, CheckCheck, UserPlus, Trophy, Megaphone, MessageCircle } from 'lucide-react';
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

const TYPE_ICONS: Record<string, React.ReactNode> = {
  FOLLOW: <UserPlus size={16} className="text-primary-light" />,
  CONNECTION_REQUEST: <UserPlus size={16} className="text-accent" />,
  CONNECTION_ACCEPTED: <Check size={16} className="text-accent" />,
  TOURNAMENT_RESULT: <Trophy size={16} className="text-secondary" />,
  ANNOUNCEMENT: <Megaphone size={16} className="text-secondary" />,
  MESSAGE: <MessageCircle size={16} className="text-primary-light" />,
};

export default function Notifications() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications');
      return data;
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All marked as read');
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell size={22} />
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-primary text-dark text-xs font-bold rounded-full">{unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-custom hover:text-white border border-dark-lighter hover:border-gray-custom rounded-lg transition-colors"
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-dark-light rounded-xl border border-dark-lighter p-16 text-center">
          <Bell size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">No notifications yet.</p>
        </div>
      ) : (
        <div className="bg-dark-light rounded-xl border border-dark-lighter divide-y divide-dark-lighter overflow-hidden">
          {notifications.map((n: any) => (
            <div
              key={n.id}
              onClick={() => !n.read && markReadMutation.mutate(n.id)}
              className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-dark/40 ${
                !n.read ? 'bg-primary/5' : ''
              }`}
            >
              {/* Icon */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                !n.read ? 'bg-primary/20' : 'bg-dark-lighter'
              }`}>
                {TYPE_ICONS[n.type] ?? <Bell size={16} className="text-gray-custom" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.read ? 'text-white font-medium' : 'text-gray-custom'}`}>
                  {n.message}
                </p>
                <p className="text-xs text-gray-custom mt-1">{timeAgo(n.createdAt)}</p>
              </div>

              {/* Unread dot */}
              {!n.read && (
                <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

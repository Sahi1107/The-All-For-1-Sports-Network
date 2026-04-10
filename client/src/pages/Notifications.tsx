import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Bell, Check, UserPlus, Trophy, Megaphone, MessageCircle } from 'lucide-react';

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

// Where to navigate when a notification is clicked
function getNotifLink(n: any): string | null {
  if (n.type === 'CONNECTION_REQUEST' || n.type === 'CONNECTION_ACCEPTED') return '/grow';
  if (n.type === 'FOLLOW' && n.actor?.id) return `/profile/${n.actor.id}`;
  if (n.type === 'MESSAGE') return '/messages';
  return null;
}

export default function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();

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

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleClick = (n: any) => {
    if (!n.read) markReadMutation.mutate(n.id);
    const link = getNotifLink(n);
    if (link) navigate(link);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Bell size={22} />
        <h1 className="text-2xl font-bold">Notifications</h1>
        {unreadCount > 0 && (
          <span className="px-2 py-0.5 bg-primary text-dark text-xs font-bold rounded-full">{unreadCount}</span>
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
              onClick={() => handleClick(n)}
              className={`flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors hover:bg-dark/40 ${
                !n.read ? 'bg-primary/5' : ''
              }`}
            >
              {/* Actor avatar or icon */}
              {n.actor ? (
                <Link to={`/profile/${n.actor.id}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  {n.actor.avatar ? (
                    <img src={n.actor.avatar} alt={n.actor.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary-light text-sm">
                      {n.actor.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>
              ) : (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  !n.read ? 'bg-primary/20' : 'bg-dark-lighter'
                }`}>
                  {TYPE_ICONS[n.type] ?? <Bell size={16} className="text-gray-custom" />}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.read ? 'text-white font-medium' : 'text-gray-custom'}`}>
                  {n.actor && (
                    <Link
                      to={`/profile/${n.actor.id}`}
                      className="font-semibold hover:text-primary-light transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {n.actor.name}
                    </Link>
                  )}{' '}
                  {n.actor
                    ? n.message.replace(n.actor.name, '').trim()
                    : n.message}
                </p>
                <p className="text-xs text-gray-custom mt-1 flex items-center gap-2">
                  {TYPE_ICONS[n.type]}
                  {timeAgo(n.createdAt)}
                </p>
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

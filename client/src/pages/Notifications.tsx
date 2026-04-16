import { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Bell, Check, UserPlus, Trophy, Megaphone, MessageCircle, Heart, Repeat2, MessageSquare as CommentIcon } from 'lucide-react';

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
  LIKE: <Heart size={16} className="text-red-400" />,
  COMMENT: <CommentIcon size={16} className="text-primary-light" />,
  REPOST: <Repeat2 size={16} className="text-green-400" />,
};

// Where to navigate when a notification is clicked
function getNotifLink(n: any): string | null {
  if (n.type === 'CONNECTION_REQUEST' || n.type === 'CONNECTION_ACCEPTED') return '/grow';
  if (n.type === 'FOLLOW' && n.actor?.id) return `/profile/${n.actor.id}`;
  if (n.type === 'MESSAGE') return '/messages';
  return null;
}

const PAGE_SIZE = 30;

export default function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [allNotifs, setAllNotifs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const markedReadRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 1],
    queryFn: async () => {
      const { data } = await api.get(`/notifications?page=1&limit=${PAGE_SIZE}`);
      return data;
    },
  });

  // Sync first page into state
  useEffect(() => {
    if (data?.notifications) {
      setAllNotifs(data.notifications);
      setTotal(data.total ?? 0);
      setPage(1);
    }
  }, [data]);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = data?.unreadCount ?? 0;

  // Auto-mark all as read when page is viewed (once)
  useEffect(() => {
    if (unreadCount > 0 && !markedReadRef.current) {
      markedReadRef.current = true;
      api.patch('/notifications/read-all').then(() => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
      });
    }
  }, [unreadCount, qc]);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const { data } = await api.get(`/notifications?page=${nextPage}&limit=${PAGE_SIZE}`);
      setAllNotifs((prev) => [...prev, ...(data.notifications ?? [])]);
      setPage(nextPage);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  const hasMore = allNotifs.length < total;

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
      ) : allNotifs.length === 0 ? (
        <div className="bg-dark-light rounded-xl border border-dark-lighter p-16 text-center">
          <Bell size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">No notifications yet.</p>
        </div>
      ) : (
        <div className="bg-dark-light rounded-xl border border-dark-lighter divide-y divide-dark-lighter overflow-hidden">
          {allNotifs.map((n: any) => (
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

      {/* Load more */}
      {!isLoading && hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 bg-dark-light hover:bg-dark-lighter border border-dark-lighter text-sm text-gray-custom hover:text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-4" />
            ) : 'Load older notifications'}
          </button>
        </div>
      )}
    </div>
  );
}

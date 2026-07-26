import BallLoader from '../components/BallLoader';
import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import {
  Bell, Check, CheckCheck, UserPlus, Trophy, Megaphone, MessageCircle, Heart, Repeat2,
  MessageSquare as CommentIcon, Users, Award, Eye, BadgeCheck, TrendingUp, Clock,
  CalendarPlus, CalendarClock, GitFork, Shield,
} from 'lucide-react';

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
  TOURNAMENT_UPDATE: <Trophy size={16} className="text-secondary" />,
  ANNOUNCEMENT: <Megaphone size={16} className="text-secondary" />,
  SYSTEM: <Shield size={16} className="text-secondary" />,
  MESSAGE: <MessageCircle size={16} className="text-primary-light" />,
  LIKE: <Heart size={16} className="text-red-400" />,
  COMMENT: <CommentIcon size={16} className="text-primary-light" />,
  REPOST: <Repeat2 size={16} className="text-green-400" />,
  TEAM_INVITE: <Users size={16} className="text-primary-light" />,
  TEAM_JOIN_REQUEST: <Users size={16} className="text-primary-light" />,
  ENDORSEMENT: <Award size={16} className="text-secondary" />,
  PROFILE_VIEW: <Eye size={16} className="text-primary-light" />,
  PROFILE_VIEWS_WEEKLY: <Eye size={16} className="text-primary-light" />,
  HIGHLIGHT_VIEW: <Eye size={16} className="text-primary-light" />,
  STATS_VERIFIED: <BadgeCheck size={16} className="text-accent" />,
  RANKING_UPDATE: <TrendingUp size={16} className="text-secondary" />,
  RANKING_MILESTONE: <Trophy size={16} className="text-primary" />,
  MATCH_STARTING_SOON: <Clock size={16} className="text-amber-400" />,
  MATCH_RESULT_PUBLISHED: <Trophy size={16} className="text-secondary" />,
  REGISTRATION_OPEN: <CalendarPlus size={16} className="text-accent" />,
  REGISTRATION_CLOSING: <Clock size={16} className="text-amber-400" />,
  DRAW_PUBLISHED: <GitFork size={16} className="text-primary-light" />,
  FIXTURES_SCHEDULED: <CalendarClock size={16} className="text-primary-light" />,
  NEW_ATHLETE_MATCH: <UserPlus size={16} className="text-accent" />,
};

// Fallback deep-link when the server didn't precompute `link` (legacy rows).
function fallbackLink(n: any): string | null {
  if (n.type === 'CONNECTION_REQUEST' || n.type === 'CONNECTION_ACCEPTED') return '/grow';
  if ((n.type === 'FOLLOW' || n.type === 'ENDORSEMENT') && n.actor?.id) return `/profile/${n.actor.id}`;
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
  const [unread, setUnread] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 1],
    queryFn: async () => (await api.get(`/notifications?page=1&limit=${PAGE_SIZE}`)).data,
  });

  useEffect(() => {
    if (data?.notifications) {
      setAllNotifs(data.notifications);
      setTotal(data.total ?? 0);
      setUnread(data.unreadCount ?? 0);
      setPage(1);
    }
  }, [data]);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Manual "mark all read" (replaces the old auto-mark-on-view).
  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      setAllNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => toast.error('Could not mark all read'),
  });

  const [respondingTeamId, setRespondingTeamId] = useState<string | null>(null);
  const dropInvite = (teamId: string) =>
    setAllNotifs((prev) => prev.filter((n) => !(n.type === 'TEAM_INVITE' && n.referenceId === teamId)));

  const acceptInviteMutation = useMutation({
    mutationFn: (teamId: string) => api.post(`/teams/${teamId}/members/me/accept`),
    onSuccess: (res: any, teamId: string) => {
      toast.success(res?.data?.isComplete ? 'Joined the team — registration is now complete!' : 'Invite accepted');
      dropInvite(teamId);
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['tournament'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Could not accept invite'),
    onSettled: () => setRespondingTeamId(null),
  });

  const declineInviteMutation = useMutation({
    mutationFn: (teamId: string) => api.post(`/teams/${teamId}/members/me/decline`),
    onSuccess: (_res, teamId: string) => { toast('Invite declined'); dropInvite(teamId); qc.invalidateQueries({ queryKey: ['notifications'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Could not decline invite'),
    onSettled: () => setRespondingTeamId(null),
  });

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const { data } = await api.get(`/notifications?page=${nextPage}&limit=${PAGE_SIZE}`);
      setAllNotifs((prev) => [...prev, ...(data.notifications ?? [])]);
      setPage(nextPage);
    } catch { /* ignore */ } finally { setLoadingMore(false); }
  }, [page]);

  const hasMore = allNotifs.length < total;

  const handleClick = (n: any) => {
    if (!n.read) {
      markReadMutation.mutate(n.id);
      setAllNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    const link = n.link ?? fallbackLink(n);
    if (link) navigate(link);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Bell size={22} />
        <h1 className="text-2xl font-bold">Notifications</h1>
        {unread > 0 && <span className="px-2 py-0.5 bg-primary text-on-primary text-xs font-bold rounded-full">{unread}</span>}
        {unread > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-custom hover:text-foreground border border-line hover:border-gray-custom rounded-lg transition-colors disabled:opacity-50"
          >
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><BallLoader /></div>
      ) : allNotifs.length === 0 ? (
        <div className="bg-card rounded-xl border border-line p-16 text-center">
          <Bell size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">No notifications yet.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-line divide-y divide-line overflow-hidden">
          {allNotifs.map((n: any) => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={`flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors hover:bg-surface/40 ${!n.read ? 'bg-primary/5' : ''}`}
            >
              {/* Actor avatar (with a small count badge when collapsed) or a type icon */}
              {n.actor ? (
                <Link to={`/profile/${n.actor.id}`} className="shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                  {n.actor.avatar
                    ? <img src={n.actor.avatar} alt={n.actor.name} className="w-10 h-10 rounded-full object-cover" />
                    : <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary-light text-sm">{n.actor.name?.charAt(0).toUpperCase()}</div>}
                  {n.count > 1 && <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center border-2 border-card">{n.count > 9 ? '9+' : n.count}</span>}
                </Link>
              ) : (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${!n.read ? 'bg-primary/20' : 'bg-elevated'}`}>
                  {TYPE_ICONS[n.type] ?? <Bell size={16} className="text-gray-custom" />}
                </div>
              )}

              {/* Content — render the server-rendered message as-is (handles collapse). */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.read ? 'text-foreground' : 'text-gray-custom'}`}>{n.message}</p>
                <p className="text-xs text-gray-custom mt-1 flex items-center gap-1.5">
                  {TYPE_ICONS[n.type]}
                  <span>{timeAgo(n.createdAt)}</span>
                </p>

                {/* Team invite — inline accept / decline */}
                {n.type === 'TEAM_INVITE' && n.referenceId && n.title === 'Team invitation' && (
                  <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => { setRespondingTeamId(n.referenceId); acceptInviteMutation.mutate(n.referenceId); }}
                      disabled={respondingTeamId === n.referenceId}
                      className="px-3 py-1.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-on-primary text-xs font-semibold rounded-lg transition-colors"
                    >Accept</button>
                    <button
                      onClick={() => { setRespondingTeamId(n.referenceId); declineInviteMutation.mutate(n.referenceId); }}
                      disabled={respondingTeamId === n.referenceId}
                      className="px-3 py-1.5 bg-surface hover:bg-elevated disabled:opacity-50 border border-line text-xs text-gray-custom hover:text-foreground rounded-lg transition-colors"
                    >Decline</button>
                  </div>
                )}
              </div>

              {!n.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
            </div>
          ))}
        </div>
      )}

      {!isLoading && hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 bg-card hover:bg-elevated border border-line text-sm text-gray-custom hover:text-foreground rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingMore ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-4" /> : 'Load older notifications'}
          </button>
        </div>
      )}
    </div>
  );
}

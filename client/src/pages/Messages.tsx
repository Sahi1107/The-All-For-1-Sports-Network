import BallLoader from '../components/BallLoader';
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { io, type Socket } from 'socket.io-client';
import { auth } from '../config/firebase';
import {
  Send, MessageCircle, Plus, X, Search, ArrowLeft,
  Copy, Trash2, CornerUpRight, MoreHorizontal,
  Archive, MoreVertical, LogOut, Users, BadgeCheck, Pin, Flag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ReportModal from '../components/ReportModal';

// ─── Helpers ──────────────────────────────────────────────────

/** Turn plain-text URLs into clickable links */
function Linkify({ children, className }: { children: string; className?: string }) {
  const parts = children.split(/(https?:\/\/[^\s<]+)/g);
  return (
    <p className={className}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** "Today" / "Yesterday" / "Mar 4" divider label for a message date. */
function dayLabel(date: string): string {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(new Date(date))) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const ROLE_FILTERS = [
  { key: 'ALL',     label: 'All' },
  { key: 'ATHLETE', label: 'Athletes' },
  { key: 'COACH',   label: 'Coaches' },
  { key: 'SCOUT',   label: 'Scouts' },
  { key: 'TEAM',    label: 'Teams' },
  { key: 'UNREAD',  label: 'Unread' },
] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number]['key'];

const PINNED_STORAGE_KEY = 'af1.pinnedConversations';

/** Small verified check, shown beside a name. */
function Verified({ className = '' }: { className?: string }) {
  return <BadgeCheck size={15} className={`shrink-0 text-accent ${className}`} aria-label="Verified" />;
}

/** Subtle uppercase role pill (e.g. SCOUT) for non-athlete participants. */
function RoleTag({ role }: { role?: string | null }) {
  if (!role) return null;
  return (
    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-custom border border-line">
      {role}
    </span>
  );
}

function presenceLabel(online: boolean | null, lastActiveAt: string | null): string | null {
  if (online === null) return null; // privacy disabled
  if (online) return 'Active now';
  if (!lastActiveAt) return null;
  const ago = timeAgo(lastActiveAt);
  return `Active ${ago} ago`;
}

function Avatar({ user, size = 10, online }: { user: any; size?: number; online?: boolean | null }) {
  const px = size * 4;
  return (
    <div className="relative shrink-0" style={{ width: px, height: px }}>
      <div
        className="rounded-full bg-elevated flex items-center justify-center font-bold overflow-hidden"
        style={{ width: px, height: px }}
      >
        {user?.avatar
          ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          : <span className="text-sm">{user?.name?.charAt(0)}</span>}
      </div>
      {online === true && (
        <span
          className="absolute bottom-0 right-0 block rounded-full bg-emerald-400 ring-2 ring-line"
          style={{ width: Math.max(8, px * 0.25), height: Math.max(8, px * 0.25) }}
        />
      )}
    </div>
  );
}

// ─── Shared Post Preview Card ─────────────────────────────────

function SharedPostCard({ post }: { post: any }) {
  if (!post) return null;
  return (
    <Link
      to={`/profile/${post.user?.id}`}
      className="block mt-1.5 rounded-lg border border-ink/20 bg-surface/60 overflow-hidden hover:bg-surface/80 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {post.media?.[0]?.url && (
        <img src={post.media[0].url} alt="" className="w-full h-28 object-cover" />
      )}
      <div className="p-2.5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full bg-elevated overflow-hidden shrink-0">
            {post.user?.avatar
              ? <img src={post.user.avatar} alt="" className="w-full h-full object-cover" />
              : <span className="text-[9px] font-bold flex items-center justify-center w-full h-full text-foreground">{post.user?.name?.charAt(0)}</span>}
          </div>
          <span className="text-xs font-medium truncate text-foreground">{post.user?.name}</span>
        </div>
        {post.title && <p className="text-xs font-semibold truncate text-foreground">{post.title}</p>}
        {post.content && (
          <p className="text-xs text-foreground/60 mt-0.5 line-clamp-2">{post.content}</p>
        )}
      </div>
    </Link>
  );
}

// ─── Shared Profile Preview Card ──────────────────────────────

function SharedProfileCard({ profile }: { profile: any }) {
  if (!profile) return null;
  const meta = [profile.role?.toLowerCase(), profile.sport?.toLowerCase().replace(/_/g, ' '), profile.position]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      to={`/profile/${profile.id}`}
      className="block mt-1.5 rounded-lg border border-ink/20 bg-surface/60 overflow-hidden hover:bg-surface/80 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-elevated overflow-hidden shrink-0">
          {profile.avatar
            ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
            : <span className="text-sm font-bold flex items-center justify-center w-full h-full text-foreground">{profile.name?.charAt(0)}</span>}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate text-foreground">{profile.name}</p>
          {meta && <p className="text-[11px] text-foreground/60 truncate capitalize">{meta}</p>}
          {profile.bio && <p className="text-[11px] text-foreground/50 mt-0.5 line-clamp-1">{profile.bio}</p>}
        </div>
      </div>
    </Link>
  );
}

// ─── Message Action Menu ──────────────────────────────────────

interface ActionMenuProps {
  msg: any;
  isMe: boolean;
  onCopy: () => void;
  onUnsend: () => void;
  onForward: () => void;
  onReport: () => void;
  onClose: () => void;
}

function MessageActionMenu({ msg, isMe, onCopy, onUnsend, onForward, onReport, onClose }: ActionMenuProps) {
  return (
    <>
      {/* Full-screen click-catcher: closing on a plain click avoids the
          mousedown race that could unmount the menu before a menu item's
          click registered (which made actions like Unsend silently no-op). */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className={`absolute z-50 ${isMe ? 'right-0' : 'left-0'} top-full mt-1 bg-card border border-line rounded-xl shadow-xl py-1 min-w-[140px]`}
      >
      <button
        type="button"
        onClick={onCopy}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-surface hover:text-foreground transition-colors"
      >
        <Copy size={14} /> Copy
      </button>
      {!msg.deletedAt && (
        <button
          type="button"
          onClick={onForward}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-surface hover:text-foreground transition-colors"
        >
          <CornerUpRight size={14} /> Forward
        </button>
      )}
      {isMe && !msg.deletedAt && (
        <button
          type="button"
          onClick={onUnsend}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-surface transition-colors"
        >
          <Trash2 size={14} /> Unsend
        </button>
      )}
      {!isMe && !msg.deletedAt && (
        <button
          type="button"
          onClick={onReport}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-surface transition-colors"
        >
          <Flag size={14} /> Report
        </button>
      )}
      </div>
    </>
  );
}

// ─── Forward Picker Modal ─────────────────────────────────────

function ForwardModal({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [convs, setConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    api.get('/messages/conversations')
      .then(({ data }) => setConvs(data.conversations ?? []))
      .finally(() => setLoading(false));
  }, []);

  const forward = async (targetConversationId: string) => {
    setSending(targetConversationId);
    try {
      await api.post(`/messages/${messageId}/forward`, { targetConversationId });
      toast.success('Message forwarded');
      onClose();
    } catch {
      toast.error('Failed to forward');
      setSending(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card rounded-t-2xl sm:rounded-xl border border-line w-full sm:max-w-sm max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-line shrink-0">
          <h2 className="font-semibold">Forward to…</h2>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <BallLoader />
            </div>
          ) : convs.length === 0 ? (
            <p className="text-sm text-gray-custom text-center py-6">No conversations</p>
          ) : (
            convs.map((c: any) => {
              const other = c.members?.find((m: any) => m.userId !== user?.id)?.user;
              return (
                <button
                  key={c.id}
                  onClick={() => forward(c.id)}
                  disabled={!!sending}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface transition-colors text-left disabled:opacity-50"
                >
                  <Avatar user={other} size={9} />
                  <span className="text-sm font-medium truncate flex-1">{other?.name ?? 'Unknown'}</span>
                  {sending === c.id ? (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send size={14} className="text-gray-custom" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function Messages() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [showNewConv, setShowNewConv] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [reportMsgId, setReportMsgId] = useState<string | null>(null);
  const [forwardingId, setForwardingId] = useState<string | null>(null);
  const [otherPresence, setOtherPresence] = useState<{ online: boolean | null; lastActiveAt: string | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [convSearch, setConvSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(PINNED_STORAGE_KEY) || '[]')); }
    catch { return new Set(); }
  });

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Socket setup ────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    auth.currentUser?.getIdToken().then((token) => {
      if (!mounted) return;
      const socketUrl = import.meta.env.VITE_API_URL || '/';
      socketRef.current = io(socketUrl, {
        auth: { token },
        transports: ['websocket'],
      });

      // Heartbeat for presence
      const heartbeat = setInterval(() => {
        socketRef.current?.emit('heartbeat');
      }, 30_000);

      socketRef.current.on('disconnect', () => clearInterval(heartbeat));
    });
    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ── Conversations query ──────────────────────────────────────

  const { data: convData } = useQuery({
    queryKey: ['conversations', showArchived],
    queryFn: async () => {
      const { data } = await api.get(`/messages/conversations?archived=${showArchived}`);
      return data;
    },
    refetchInterval: 10000,
  });

  // ── Fetch messages when active conversation changes ──────────

  useEffect(() => {
    if (!activeConvId) return;
    api.get(`/messages/conversations/${activeConvId}`).then(({ data }) => {
      setMessages(data.messages ?? []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    api.patch(`/messages/conversations/${activeConvId}/read`).then(() => {
      qc.invalidateQueries({ queryKey: ['messages-unread'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    }).catch(() => {});
    setChatMenuOpen(false);
  }, [activeConvId, qc]);

  // ── Fetch presence for the other user in active conversation ─

  const conversations = convData?.conversations ?? [];
  const activeConv = conversations.find((c: any) => c.id === activeConvId);

  const getOther = useCallback((conv: any) =>
    conv.members?.find((p: any) => p.userId !== user?.id)?.user, [user?.id]);

  // `activeConv` is a fresh object reference every render (Array.find result),
  // so depending on it re-ran this effect on every render and kicked off a
  // cascade of presence fetches + `setOtherPresence` re-renders.
  // Pin the effect to a primitive id.
  const otherUserId = useMemo(
    () => activeConv?.members?.find((p: any) => p.userId !== user?.id)?.userId as string | undefined,
    [activeConv?.id, user?.id]
  );

  useEffect(() => {
    if (!otherUserId) { setOtherPresence(null); return; }
    const fetchPresence = () =>
      api.get(`/messages/presence/${otherUserId}`)
        .then(({ data }) => setOtherPresence(data))
        .catch(() => setOtherPresence(null));
    fetchPresence();
    const iv = setInterval(fetchPresence, 30_000);
    return () => clearInterval(iv);
  }, [otherUserId]);

  // ── Socket listeners ─────────────────────────────────────────

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    const onMessage = (msg: any) => {
      if (msg.conversationId === activeConvId) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['messages-unread'] });
    };

    const onDeleted = (data: any) => {
      if (data.conversationId === activeConvId) {
        setMessages(prev => prev.map(m => m.id === data.id ? { ...m, content: '', deletedAt: data.deletedAt } : m));
      }
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };

    s.on('message', onMessage);
    s.on('message_deleted', onDeleted);

    return () => {
      s.off('message', onMessage);
      s.off('message_deleted', onDeleted);
    };
  }, [activeConvId, qc]);

  useEffect(() => {
    if (!activeConvId || !socketRef.current) return;
    socketRef.current.emit('join_conversation', activeConvId);
    return () => { socketRef.current?.emit('leave_conversation', activeConvId); };
  }, [activeConvId]);

  // ── Send message ─────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/messages/conversations/${activeConvId}`, { content: messageText });
      return data;
    },
    onSuccess: (data) => {
      setMessages(prev => {
        if (prev.some(m => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      setMessageText('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    },
    onError: () => toast.error('Failed to send'),
  });

  // ── Unsend message ───────────────────────────────────────────

  const unsendMutation = useMutation({
    // Cap the request so a stalled network call fails loudly (rollback + toast)
    // instead of hanging forever and looking like nothing happened.
    mutationFn: async (msgId: string) => {
      await api.delete(`/messages/${msgId}`, { timeout: 15000 });
      return msgId;
    },
    // Optimistically mark the message deleted so the UI reacts instantly on click,
    // independent of the round-trip. Snapshot prior state for rollback on failure.
    onMutate: (msgId: string) => {
      // Snapshot from current state *before* mutating, so rollback restores the
      // real content. (Reading inside the setState updater isn't safe — it runs
      // after onMutate has already returned the context.)
      const target = messages.find(m => m.id === msgId);
      const prevContent = target?.content ?? '';
      const prevDeletedAt = target?.deletedAt ?? null;
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, content: '', deletedAt: new Date().toISOString() } : m
      ));
      return { msgId, prevContent, prevDeletedAt };
    },
    onSuccess: () => toast.success('Message unsent'),
    onError: (_err, _msgId, ctx) => {
      if (ctx) {
        setMessages(prev => prev.map(m => m.id === ctx.msgId
          ? { ...m, content: ctx.prevContent, deletedAt: ctx.prevDeletedAt }
          : m));
      }
      toast.error('Failed to unsend');
    },
  });

  // ── User search for new conversations ────────────────────────

  const { data: searchData } = useQuery({
    queryKey: ['user-search-msg', recipientSearch],
    queryFn: async () => {
      if (recipientSearch.length < 2) return { users: [] };
      const { data } = await api.get(`/users?search=${recipientSearch}&limit=5`);
      return data;
    },
    enabled: recipientSearch.length >= 2,
  });

  const newConvMutation = useMutation({
    mutationFn: (userId: string) => api.post('/messages/conversations', { userId }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setActiveConvId(data.data.conversation.id);
      setShowNewConv(false);
      setRecipientSearch('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Could not start conversation';
      toast.error(msg);
    },
  });

  // ── Action handlers ──────────────────────────────────────────

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !activeConvId) return;
    sendMutation.mutate();
  };

  const openConv = (id: string) => {
    setActiveConvId(id);
    setActiveMenu(null);
    setChatMenuOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
    setActiveMenu(null);
  };

  const handleArchive = async () => {
    if (!activeConvId) return;
    try {
       await api.patch(`/messages/conversations/${activeConvId}/archive`, { isArchived: !showArchived });
       toast.success(showArchived ? 'Chat unarchived' : 'Chat archived');
       qc.invalidateQueries({ queryKey: ['conversations'] });
       setActiveConvId(null);
    } catch { toast.error('Failed to update archive status'); }
    setChatMenuOpen(false);
  };

  const handleExit = async () => {
    if (!activeConvId) return;
    if (!confirm('Are you sure you want to exit this chat? You will lose access to its history.')) return;
    try {
      await api.delete(`/messages/conversations/${activeConvId}/exit`);
      toast.success('Exited chat');
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setActiveConvId(null);
    } catch { toast.error('Failed to exit chat'); }
    setChatMenuOpen(false);
  };

  const handleUnsend = (msgId: string) => {
    setActiveMenu(null);
    unsendMutation.mutate(msgId);
  };

  const handleForward = (msgId: string) => {
    setActiveMenu(null);
    setForwardingId(msgId);
  };

  // ── Presence helper for conversation list ────────────────────

  const getOnlineStatus = (conv: any): boolean | null => {
    const other = conv.members?.find((m: any) => m.userId !== user?.id)?.user;
    if (!other?.showOnlineStatus) return null;
    if (!other.lastActiveAt) return false;
    return Date.now() - new Date(other.lastActiveAt).getTime() < 2 * 60 * 1000;
  };

  // ── Inbox search + role filtering, split into pinned / recent ─
  const { pinnedConvs, recentConvs } = useMemo(() => {
    const q = convSearch.trim().toLowerCase();

    const matches = (conv: any) => {
      const other = conv.members?.find((m: any) => m.userId !== user?.id)?.user;
      // Role filter
      if (roleFilter === 'UNREAD') {
        if (!((conv.unreadCount ?? 0) > 0)) return false;
      } else if (roleFilter === 'TEAM') {
        if (!conv.isGroup && other?.role !== 'TEAM') return false;
      } else if (roleFilter !== 'ALL') {
        if (conv.isGroup || other?.role !== roleFilter) return false;
      }
      // Search filter
      if (q) {
        const name = (conv.isGroup ? conv.name : other?.name) ?? '';
        const last = conv.messages?.[0]?.content ?? '';
        if (!name.toLowerCase().includes(q) && !last.toLowerCase().includes(q)) return false;
      }
      return true;
    };

    const visible = conversations.filter(matches);
    return {
      pinnedConvs: visible.filter((c: any) => pinnedIds.has(c.id)),
      recentConvs: visible.filter((c: any) => !pinnedIds.has(c.id)),
    };
  }, [conversations, convSearch, roleFilter, pinnedIds, user?.id]);

  const hasAnyVisible = pinnedConvs.length + recentConvs.length > 0;

  // ── New Conversation Modal ────────────────────────────────────────────────
  const NewConvModal = (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card rounded-t-2xl sm:rounded-xl border border-line w-full sm:max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-line">
          <h2 className="font-semibold">New Message</h2>
          <button onClick={() => { setShowNewConv(false); setRecipientSearch(''); }} className="text-gray-custom hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" />
            <input
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              placeholder="Search by name..."
              autoFocus
              className="w-full pl-8 pr-3 py-2.5 bg-surface border border-line rounded-xl text-sm text-foreground placeholder-gray-custom focus:outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {(searchData?.users ?? []).filter((u: any) => u.id !== user?.id).map((u: any) => (
              <button
                key={u.id}
                onClick={() => newConvMutation.mutate(u.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface transition-colors text-left"
              >
                <Avatar user={u} size={9} />
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-gray-custom">{u.role}</p>
                </div>
              </button>
            ))}
            {recipientSearch.length >= 2 && (searchData?.users ?? []).length === 0 && (
              <p className="text-sm text-gray-custom text-center py-4">No users found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Conversation row (wide for the rest state, compact when a thread is open) ─
  const renderRow = (conv: any, compact: boolean) => {
    const isGroup = conv.isGroup;
    const other = getOther(conv);
    const lastMsg = conv.messages?.[0];
    const online = !isGroup && getOnlineStatus(conv);
    const isActive = conv.id === activeConvId;
    const isPinned = pinnedIds.has(conv.id);
    const unread = conv.unreadCount ?? 0;
    const title = isGroup ? conv.name : (other?.name ?? 'Unknown');
    const isAthlete = !other?.role || other.role === 'ATHLETE';
    const meta = !isGroup && isAthlete
      ? [other?.sport?.toLowerCase().replace(/_/g, ' '), other?.position].filter(Boolean).join(' · ')
      : null;

    const preview = lastMsg?.deletedAt
      ? 'This message was deleted'
      : lastMsg?.content || 'No messages yet';
    let prefix = '';
    if (lastMsg && !lastMsg.deletedAt) {
      if (lastMsg.sender?.id === user?.id) prefix = 'You: ';
      else if (isGroup && lastMsg.sender?.name) prefix = `${lastMsg.sender.name}: `;
    }

    return (
      <div key={conv.id} className="relative group">
        <button
          onClick={() => openConv(conv.id)}
          className={`w-full flex items-start gap-3 text-left rounded-xl transition-colors ${compact ? 'px-2.5 py-2.5' : 'px-3 py-3'} ${
            isActive ? 'bg-elevated ring-1 ring-line' : 'hover:bg-surface/60'
          }`}
        >
          {isGroup ? (
            <div className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} bg-elevated rounded-full flex items-center justify-center shrink-0 border border-line`}>
              <Users size={compact ? 16 : 20} className="text-gray-custom" />
            </div>
          ) : (
            <Avatar user={other} size={compact ? 10 : 12} online={online} />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`truncate ${unread ? 'font-bold text-foreground' : 'font-semibold'}`}>{title}</span>
              {!isGroup && other?.verified && <Verified />}
              {!compact && !isGroup && !isAthlete && <RoleTag role={other?.role} />}
              {!compact && meta && <span className="truncate text-xs text-gray-custom capitalize">{meta}</span>}
              {lastMsg && <span className="ml-auto shrink-0 text-xs text-gray-custom">{timeAgo(lastMsg.createdAt)}</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className={`flex-1 truncate text-sm ${lastMsg?.deletedAt ? 'italic text-gray-custom' : unread ? 'text-foreground' : 'text-gray-custom'}`}>
                {prefix}{preview}
              </p>
              {unread > 0 && (
                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Pin toggle — persistent when pinned, on hover otherwise (desktop) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePin(conv.id); }}
          className={`absolute right-2 top-2 p-1 rounded-md bg-card/80 backdrop-blur-sm transition-opacity ${
            isPinned
              ? 'text-primary opacity-100'
              : 'text-gray-custom opacity-0 group-hover:opacity-100 hover:text-foreground'
          }`}
          aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          <Pin size={13} className={isPinned ? 'fill-current' : ''} />
        </button>
      </div>
    );
  };

  // ── Top bar: title, search, role filters (stays pinned above list + thread) ─
  const TopBar = (
    <div className={`shrink-0 ${activeConvId ? 'hidden md:block' : 'block'}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Messages</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowArchived((s) => !s); setActiveConvId(null); }}
            className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-medium border transition-colors ${
              showArchived ? 'bg-elevated text-foreground border-line' : 'text-gray-custom border-line hover:text-foreground'
            }`}
            title={showArchived ? 'Show active chats' : 'Show archived chats'}
          >
            <Archive size={15} />
            <span className="hidden sm:inline">{showArchived ? 'Archived' : 'Archive'}</span>
          </button>
          <button
            onClick={() => setShowNewConv(true)}
            className="h-9 px-4 inline-flex items-center gap-1.5 rounded-full bg-primary hover:bg-primary-dark text-on-primary font-semibold text-sm transition-colors"
          >
            <Plus size={16} /> New
          </button>
        </div>
      </div>

      <div className="px-4">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-custom" />
          <input
            value={convSearch}
            onChange={(e) => setConvSearch(e.target.value)}
            placeholder="Search people and messages"
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-line rounded-xl text-sm text-foreground placeholder-gray-custom focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3">
        {ROLE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setRoleFilter(f.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              roleFilter === f.key
                ? 'bg-primary text-on-primary border-transparent font-semibold'
                : 'bg-card text-gray-custom border-line hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );

  // ── Inbox list (sectioned in the rest state, flat & compact when open) ──────
  const InboxList = (
    <div className="flex-1 overflow-y-auto px-2 pb-4">
      {!hasAnyVisible ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 py-16">
          <MessageCircle size={32} className="text-gray-custom" />
          <p className="text-sm text-gray-custom">
            {convSearch || roleFilter !== 'ALL'
              ? 'No conversations match your filters.'
              : `No ${showArchived ? 'archived ' : ''}conversations yet.`}
          </p>
        </div>
      ) : activeConvId ? (
        <div className="space-y-0.5 pt-2">
          {[...pinnedConvs, ...recentConvs].map((c: any) => renderRow(c, true))}
        </div>
      ) : (
        <>
          {pinnedConvs.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-custom">
                <Pin size={11} /> Pinned
              </div>
              <div className="space-y-0.5">{pinnedConvs.map((c: any) => renderRow(c, false))}</div>
            </>
          )}
          {recentConvs.length > 0 && (
            <>
              <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-custom">Recent</div>
              <div className="space-y-0.5">{recentConvs.map((c: any) => renderRow(c, false))}</div>
            </>
          )}
        </>
      )}
    </div>
  );

  // ── Chat View ─────────────────────────────────────────────────────────────
  const ChatView = activeConv ? (() => {
    const isGroup = activeConv.isGroup;
    const other = getOther(activeConv);
    const otherMember = activeConv.members?.find((m: any) => m.userId !== user?.id);
    const presence = isGroup ? null : presenceLabel(otherPresence?.online ?? null, otherPresence?.lastActiveAt ?? null);
    const isAthlete = !other?.role || other.role === 'ATHLETE';
    const headerMeta = isGroup
      ? `${activeConv.members.length} members`
      : [
          presence,
          isAthlete ? other?.sport?.toLowerCase().replace(/_/g, ' ') : other?.role?.toLowerCase(),
          other?.position,
        ].filter(Boolean).join(' · ');
    const firstName = (isGroup ? activeConv.name : other?.name)?.split(' ')[0] ?? '';

    // Truthful "Seen / Sent" status for my most recent message, using the other
    // member's lastReadAt timestamp.
    const lastMsg = messages[messages.length - 1];
    let sentStatus: string | null = null;
    if (!isGroup && lastMsg && lastMsg.senderId === user?.id && !lastMsg.deletedAt) {
      const seen = otherMember?.lastReadAt && new Date(otherMember.lastReadAt) >= new Date(lastMsg.createdAt);
      sentStatus = `${seen ? 'Seen' : 'Sent'} · ${timeAgo(lastMsg.createdAt)}`;
    }

    let lastDay = '';

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-line shrink-0">
          <button
            onClick={() => setActiveConvId(null)}
            className="md:hidden p-1 -ml-1 text-gray-custom hover:text-foreground transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>

          {isGroup ? (
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <div className="w-10 h-10 bg-elevated rounded-full flex items-center justify-center shrink-0 border border-line">
                <Users size={16} className="text-gray-custom" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold truncate">{activeConv.name}</h2>
                {headerMeta && <p className="text-xs text-gray-custom truncate mt-0.5">{headerMeta}</p>}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <Avatar user={other} size={10} online={otherPresence?.online ?? false} />
              <div className="min-w-0">
                <h2 className="font-semibold truncate flex items-center gap-1.5">
                  <span className="truncate">{other?.name ?? 'Unknown'}</span>
                  {other?.verified && <Verified />}
                </h2>
                {headerMeta && (
                  <p className={`text-xs truncate mt-0.5 capitalize ${otherPresence?.online ? 'text-accent' : 'text-gray-custom'}`}>
                    {headerMeta}
                  </p>
                )}
              </div>
            </div>
          )}

          {!isGroup && other?.id && (
            <Link
              to={`/profile/${other.id}`}
              className="hidden sm:inline-flex items-center h-8 px-3 rounded-full border border-line text-sm text-foreground hover:bg-surface transition-colors"
            >
              Profile
            </Link>
          )}

          <div className="relative">
            <button
              onClick={() => setChatMenuOpen(!chatMenuOpen)}
              className="p-2 text-gray-custom hover:text-foreground hover:bg-surface rounded-full transition-colors"
              aria-label="Conversation options"
            >
              <MoreVertical size={20} />
            </button>

            {chatMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setChatMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-line rounded-xl shadow-xl z-50 overflow-hidden py-1 transform origin-top-right">
                  <button
                    onClick={handleArchive}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-card transition-colors"
                  >
                    <Archive size={16} />
                    {showArchived ? 'Unarchive Chat' : 'Archive Chat'}
                  </button>
                  <button
                    onClick={handleExit}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-card transition-colors"
                  >
                    <LogOut size={16} />
                    Exit Chat
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-1.5">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-center px-6">
              <p className="text-sm text-gray-custom">
                No messages yet. Say hello{firstName ? ` to ${firstName}` : ''}.
              </p>
            </div>
          )}
          {messages.map((msg: any, i: number) => {
            const isMe = msg.senderId === user?.id;
            const isDeleted = !!msg.deletedAt;
            const showMenu = activeMenu === msg.id;
            const thisDay = dayLabel(msg.createdAt);
            const showDay = thisDay !== lastDay;
            lastDay = thisDay;

            return (
              <Fragment key={msg.id ?? i}>
                {showDay && (
                  <div className="flex justify-center py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-custom">{thisDay}</span>
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}>
                  <div className="relative max-w-[78%]">
                    {/* Action trigger */}
                    {!isDeleted && (
                      <button
                        type="button"
                        onClick={() => setActiveMenu(showMenu ? null : msg.id)}
                        className={`absolute top-1 ${isMe ? '-left-8' : '-right-8'} text-gray-custom hover:text-foreground p-1 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity`}
                        aria-label="Message actions"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    )}

                    {/* Action menu */}
                    {showMenu && (
                      <MessageActionMenu
                        msg={msg}
                        isMe={isMe}
                        onCopy={() => handleCopy(msg.content)}
                        onUnsend={() => handleUnsend(msg.id)}
                        onForward={() => handleForward(msg.id)}
                        onReport={() => { setActiveMenu(null); setReportMsgId(msg.id); }}
                        onClose={() => setActiveMenu(null)}
                      />
                    )}

                    {/* Message bubble */}
                    {isDeleted ? (
                      <div className={`rounded-2xl px-4 py-2.5 bg-elevated/50 ${isMe ? 'rounded-br-md' : 'rounded-bl-md'}`}>
                        <p className="text-sm text-foreground/40 italic">This message was deleted</p>
                      </div>
                    ) : (
                      <div className={`rounded-2xl px-4 py-2.5 ${
                        isMe ? 'bg-primary text-on-primary rounded-br-md' : 'bg-elevated text-foreground rounded-bl-md'
                      }`}>
                        {msg.content && msg.content !== '[Shared post]' && msg.content !== '[Shared profile]' && (
                          <Linkify className="text-sm leading-snug whitespace-pre-wrap break-words">{msg.content}</Linkify>
                        )}
                        {msg.sharedPost && <SharedPostCard post={msg.sharedPost} />}
                        {msg.sharedProfile && <SharedProfileCard profile={msg.sharedProfile} />}
                      </div>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
          {sentStatus && (
            <div className="flex justify-end pt-0.5">
              <span className="text-[11px] text-gray-custom">{sentStatus}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <form onSubmit={handleSend} className="px-3 sm:px-4 py-3 border-t border-line flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-gray-custom hover:text-foreground hover:bg-surface transition-colors"
            aria-label="Add to message"
          >
            <Plus size={20} />
          </button>
          <input
            ref={inputRef}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={firstName ? `Message ${firstName}...` : 'Message...'}
            className="flex-1 bg-surface border border-line rounded-full px-4 py-2.5 text-sm text-foreground placeholder-gray-custom focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!messageText.trim() || sendMutation.isPending}
            className="w-10 h-10 flex items-center justify-center bg-primary hover:bg-primary-dark disabled:opacity-40 text-on-primary rounded-full transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    );
  })() : (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <MessageCircle size={32} className="mx-auto mb-3 text-gray-custom" />
        <p className="text-gray-custom text-sm">Select a conversation to start chatting</p>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-8rem)]">
      {showNewConv && NewConvModal}
      {forwardingId && (
        <ForwardModal messageId={forwardingId} onClose={() => setForwardingId(null)} />
      )}

      <ReportModal
        open={!!reportMsgId}
        onClose={() => setReportMsgId(null)}
        title="Report message"
        endpoint={`/messages/${reportMsgId}/report`}
      />

      <div className="h-full flex flex-col bg-card rounded-2xl border border-line overflow-hidden">
        {TopBar}
        <div className="flex-1 flex min-h-0 border-t border-line">
          {/* List column — full width at rest, compact rail once a thread is open */}
          <div
            className={`flex flex-col min-h-0 ${
              activeConvId ? 'hidden md:flex md:w-80 lg:w-96 md:border-r md:border-line' : 'flex w-full'
            }`}
          >
            {InboxList}
          </div>

          {/* Thread — slides in beside the list (full screen on mobile) */}
          {activeConvId && (
            <div className="flex flex-col min-h-0 flex-1 w-full">
              {ChatView}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

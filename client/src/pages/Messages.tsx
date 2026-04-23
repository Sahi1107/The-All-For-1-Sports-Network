import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { io, type Socket } from 'socket.io-client';
import { auth } from '../config/firebase';
import {
  Send, MessageCircle, Plus, X, Search, ArrowLeft, Edit,
  Copy, Pencil, Trash2, CornerUpRight, MoreHorizontal, Check,
  Archive, MoreVertical, LogOut, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

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
        className="rounded-full bg-dark-lighter flex items-center justify-center font-bold overflow-hidden"
        style={{ width: px, height: px }}
      >
        {user?.avatar
          ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          : <span className="text-sm">{user?.name?.charAt(0)}</span>}
      </div>
      {online === true && (
        <span
          className="absolute bottom-0 right-0 block rounded-full bg-emerald-400 ring-2 ring-dark-light"
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
      className="block mt-1.5 rounded-lg border border-white/20 bg-dark/60 overflow-hidden hover:bg-dark/80 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {post.media?.[0]?.url && (
        <img src={post.media[0].url} alt="" className="w-full h-28 object-cover" />
      )}
      <div className="p-2.5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full bg-dark-lighter overflow-hidden shrink-0">
            {post.user?.avatar
              ? <img src={post.user.avatar} alt="" className="w-full h-full object-cover" />
              : <span className="text-[9px] font-bold flex items-center justify-center w-full h-full text-white">{post.user?.name?.charAt(0)}</span>}
          </div>
          <span className="text-xs font-medium truncate text-white">{post.user?.name}</span>
        </div>
        {post.title && <p className="text-xs font-semibold truncate text-white">{post.title}</p>}
        {post.content && (
          <p className="text-xs text-white/60 mt-0.5 line-clamp-2">{post.content}</p>
        )}
      </div>
    </Link>
  );
}

// ─── Shared Profile Preview Card ──────────────────────────────

function SharedProfileCard({ profile }: { profile: any }) {
  if (!profile) return null;
  const meta = [profile.role?.toLowerCase(), profile.sport?.toLowerCase(), profile.position]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      to={`/profile/${profile.id}`}
      className="block mt-1.5 rounded-lg border border-white/20 bg-dark/60 overflow-hidden hover:bg-dark/80 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-dark-lighter overflow-hidden shrink-0">
          {profile.avatar
            ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
            : <span className="text-sm font-bold flex items-center justify-center w-full h-full text-white">{profile.name?.charAt(0)}</span>}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate text-white">{profile.name}</p>
          {meta && <p className="text-[11px] text-white/60 truncate capitalize">{meta}</p>}
          {profile.bio && <p className="text-[11px] text-white/50 mt-0.5 line-clamp-1">{profile.bio}</p>}
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
  onEdit: () => void;
  onUnsend: () => void;
  onForward: () => void;
  onClose: () => void;
}

function MessageActionMenu({ msg, isMe, onCopy, onEdit, onUnsend, onForward, onClose }: ActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={`absolute z-30 ${isMe ? 'right-0' : 'left-0'} top-full mt-1 bg-dark-light border border-dark-lighter rounded-xl shadow-xl py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-150`}
    >
      <button
        onClick={onCopy}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/80 hover:bg-dark hover:text-white transition-colors"
      >
        <Copy size={14} /> Copy
      </button>
      {isMe && !msg.deletedAt && (
        <button
          onClick={onEdit}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/80 hover:bg-dark hover:text-white transition-colors"
        >
          <Pencil size={14} /> Edit
        </button>
      )}
      {!msg.deletedAt && (
        <button
          onClick={onForward}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/80 hover:bg-dark hover:text-white transition-colors"
        >
          <CornerUpRight size={14} /> Forward
        </button>
      )}
      {isMe && !msg.deletedAt && (
        <button
          onClick={onUnsend}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-dark transition-colors"
        >
          <Trash2 size={14} /> Unsend
        </button>
      )}
    </div>
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
      <div className="bg-dark-light rounded-t-2xl sm:rounded-xl border border-dark-lighter w-full sm:max-w-sm max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-dark-lighter shrink-0">
          <h2 className="font-semibold">Forward to…</h2>
          <button onClick={onClose} className="text-gray-custom hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-dark transition-colors text-left disabled:opacity-50"
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [forwardingId, setForwardingId] = useState<string | null>(null);
  const [otherPresence, setOtherPresence] = useState<{ online: boolean | null; lastActiveAt: string | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
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
    }).catch(() => {});
    setChatMenuOpen(false);
  }, [activeConvId, qc]);

  // ── Fetch presence for the other user in active conversation ─

  const conversations = convData?.conversations ?? [];
  const activeConv = conversations.find((c: any) => c.id === activeConvId);

  const getOther = useCallback((conv: any) =>
    conv.members?.find((p: any) => p.userId !== user?.id)?.user, [user?.id]);

  useEffect(() => {
    if (!activeConv) { setOtherPresence(null); return; }
    const other = getOther(activeConv);
    if (!other?.id) return;
    api.get(`/messages/presence/${other.id}`)
      .then(({ data }) => setOtherPresence(data))
      .catch(() => setOtherPresence(null));

    // Refresh presence periodically
    const iv = setInterval(() => {
      api.get(`/messages/presence/${other.id}`)
        .then(({ data }) => setOtherPresence(data))
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(iv);
  }, [activeConv, getOther]);

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

    const onEdited = (msg: any) => {
      if (msg.conversationId === activeConvId) {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: msg.content, editedAt: msg.editedAt } : m));
      }
    };

    const onDeleted = (data: any) => {
      if (data.conversationId === activeConvId) {
        setMessages(prev => prev.map(m => m.id === data.id ? { ...m, content: '', deletedAt: data.deletedAt } : m));
      }
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };

    s.on('message', onMessage);
    s.on('message_edited', onEdited);
    s.on('message_deleted', onDeleted);

    return () => {
      s.off('message', onMessage);
      s.off('message_edited', onEdited);
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

  // ── Edit message ─────────────────────────────────────────────

  const editMutation = useMutation({
    mutationFn: async (msgId: string) => {
      const { data } = await api.patch(`/messages/${msgId}/edit`, { content: editText });
      return data;
    },
    onSuccess: (data) => {
      setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m));
      setEditingId(null);
      setEditText('');
      toast.success('Message edited');
    },
    onError: () => toast.error('Failed to edit'),
  });

  // ── Unsend message ───────────────────────────────────────────

  const unsendMutation = useMutation({
    mutationFn: async (msgId: string) => {
      await api.delete(`/messages/${msgId}`);
      return msgId;
    },
    onSuccess: (msgId) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: '', deletedAt: new Date().toISOString() } : m));
      toast.success('Message unsent');
    },
    onError: () => toast.error('Failed to unsend'),
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
    setEditingId(null);
    setChatMenuOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
    setActiveMenu(null);
  };

  const handleStartEdit = (msg: any) => {
    setEditingId(msg.id);
    setEditText(msg.content);
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

  const handleConfirmEdit = (msgId: string) => {
    if (!editText.trim()) return;
    editMutation.mutate(msgId);
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

  // ── New Conversation Modal ────────────────────────────────────────────────
  const NewConvModal = (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-dark-light rounded-t-2xl sm:rounded-xl border border-dark-lighter w-full sm:max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-dark-lighter">
          <h2 className="font-semibold">New Message</h2>
          <button onClick={() => { setShowNewConv(false); setRecipientSearch(''); }} className="text-gray-custom hover:text-white">
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
              className="w-full pl-8 pr-3 py-2.5 bg-dark border border-dark-lighter rounded-xl text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {(searchData?.users ?? []).filter((u: any) => u.id !== user?.id).map((u: any) => (
              <button
                key={u.id}
                onClick={() => newConvMutation.mutate(u.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-dark transition-colors text-left"
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

  // ── Conversation List ─────────────────────────────────────────────────────
  const ConversationList = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-lighter shrink-0">
        <h1 className="text-xl font-bold">Messages</h1>
        <button
          onClick={() => setShowNewConv(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-primary hover:bg-primary-dark text-dark transition-colors"
          aria-label="New message"
        >
          <Edit size={16} />
        </button>
      </div>

      <div className="flex bg-dark-lighter p-1 mx-4 my-2 rounded-lg shrink-0">
        <button
          onClick={() => { setShowArchived(false); setActiveConvId(null); }}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${!showArchived ? 'bg-dark text-white shadow-sm' : 'text-gray-custom hover:text-white'}`}
        >
          Active
        </button>
        <button
          onClick={() => { setShowArchived(true); setActiveConvId(null); }}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${showArchived ? 'bg-dark text-white shadow-sm' : 'text-gray-custom hover:text-white'}`}
        >
          Archived
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <MessageCircle size={36} className="text-gray-custom" />
            <p className="text-gray-custom text-sm">No {showArchived ? 'archived ' : ''}conversations.</p>
          </div>
        ) : conversations.map((conv: any) => {
          const isGroup = conv.isGroup;
          const other = getOther(conv);
          const lastMsg = conv.messages?.[0];
          const online = !isGroup && getOnlineStatus(conv);
          const lastPreview = lastMsg?.deletedAt
            ? 'This message was deleted'
            : lastMsg?.content ?? 'No messages yet';
          
          const title = isGroup ? conv.name : (other?.name ?? 'Unknown');
          return (
            <button
              key={conv.id}
              onClick={() => openConv(conv.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark/40 active:bg-dark/60 transition-colors text-left border-b border-dark-lighter/30"
            >
              {isGroup ? (
                <div className="w-12 h-12 bg-dark-lighter rounded-full flex items-center justify-center shrink-0 border border-dark/50">
                  <Users size={20} className="text-gray-custom" />
                </div>
              ) : (
                <Avatar user={other} size={12} online={online} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-sm font-semibold truncate">{title}</p>
                  {lastMsg && <span className="text-xs text-gray-custom shrink-0">{timeAgo(lastMsg.createdAt)}</span>}
                </div>
                <p className={`text-sm truncate ${lastMsg?.deletedAt ? 'text-gray-custom italic' : 'text-gray-custom'}`}>
                  {lastPreview}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Chat View ─────────────────────────────────────────────────────────────
  const ChatView = activeConv ? (() => {
    const isGroup = activeConv.isGroup;
    const other = getOther(activeConv);
    const pLabel = isGroup ? `${activeConv.members.length} members` : presenceLabel(otherPresence?.online ?? null, otherPresence?.lastActiveAt ?? null);

    return (
      <div className="flex flex-col h-full">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-3 py-3 border-b border-dark-lighter shrink-0">
          <button
            onClick={() => setActiveConvId(null)}
            className="md:hidden p-1 -ml-1 text-gray-custom hover:text-white transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          
          {isGroup ? (
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <div className="w-10 h-10 bg-dark rounded-full flex items-center justify-center shrink-0 border border-dark-lighter">
                <Users size={16} className="text-gray-custom" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold truncate">{activeConv.name}</h2>
                <div className="text-xs text-emerald-400 mt-0.5">{pLabel}</div>
              </div>
            </div>
          ) : (
            <Link to={`/profile/${other?.id}`} className="flex-1 min-w-0 flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Avatar user={other} size={10} online={otherPresence?.online ?? false} />
              <div className="min-w-0">
                <h2 className="font-semibold truncate">{other?.name ?? 'Unknown'}</h2>
                <div className="text-xs text-emerald-400 mt-0.5">{pLabel}</div>
              </div>
            </Link>
          )}

          <div className="relative">
            <button 
               onClick={() => setChatMenuOpen(!chatMenuOpen)} 
               className="p-2 text-gray-custom hover:text-white hover:bg-dark rounded-full transition-colors"
            >
              <MoreVertical size={20} />
            </button>

            {chatMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setChatMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-dark border border-dark-lighter rounded-xl shadow-xl z-50 overflow-hidden py-1 transform origin-top-right">
                  <button
                    onClick={handleArchive}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-dark-light transition-colors"
                  >
                    <Archive size={16} />
                    {showArchived ? 'Unarchive Chat' : 'Archive Chat'}
                  </button>
                  <button
                    onClick={handleExit}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-dark-light transition-colors"
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
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {messages.map((msg: any, i: number) => {
            const isMe = msg.senderId === user?.id;
            const isDeleted = !!msg.deletedAt;
            const isEditing = editingId === msg.id;
            const showMenu = activeMenu === msg.id;

            return (
              <div key={msg.id ?? i} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}>
                <div className="relative max-w-[75%]">
                  {/* Action trigger */}
                  {!isDeleted && !isEditing && (
                    <button
                      onClick={() => setActiveMenu(showMenu ? null : msg.id)}
                      className={`absolute top-1 ${isMe ? '-left-8' : '-right-8'} text-gray-custom hover:text-white p-1 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity`}
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
                      onEdit={() => handleStartEdit(msg)}
                      onUnsend={() => handleUnsend(msg.id)}
                      onForward={() => handleForward(msg.id)}
                      onClose={() => setActiveMenu(null)}
                    />
                  )}

                  {/* Message bubble */}
                  {isEditing ? (
                    <div className={`rounded-2xl px-4 py-2.5 ${isMe ? 'bg-primary/20 border border-primary/40' : 'bg-dark-lighter border border-white/10'}`}>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (editText.trim() && !editMutation.isPending) handleConfirmEdit(msg.id);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingId(null);
                            setEditText('');
                          }
                        }}
                        className="w-full bg-transparent text-sm text-white resize-none focus:outline-none min-h-[2rem]"
                        autoFocus
                        rows={2}
                      />
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-[10px] text-white/40">Enter to save · Esc to cancel</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingId(null); setEditText(''); }}
                            className="text-xs text-gray-custom hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleConfirmEdit(msg.id)}
                            disabled={!editText.trim() || editMutation.isPending}
                            className="text-xs text-primary hover:text-primary-light disabled:opacity-50 flex items-center gap-1"
                          >
                            <Check size={12} /> Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : isDeleted ? (
                    <div className={`rounded-2xl px-4 py-2.5 ${
                      isMe ? 'bg-dark-lighter/50 rounded-br-sm' : 'bg-dark-lighter/50 rounded-bl-sm'
                    }`}>
                      <p className="text-sm text-white/30 italic">This message was deleted</p>
                    </div>
                  ) : (
                    <div className={`rounded-2xl px-4 py-2.5 ${
                      isMe ? 'bg-primary text-dark rounded-br-sm' : 'bg-dark-lighter text-white rounded-bl-sm'
                    }`}>
                      {msg.content && msg.content !== '[Shared post]' && msg.content !== '[Shared profile]' && (
                        <Linkify className="text-sm leading-snug">{msg.content}</Linkify>
                      )}

                      {/* Shared post preview */}
                      {msg.sharedPost && <SharedPostCard post={msg.sharedPost} />}

                      {/* Shared profile preview */}
                      {msg.sharedProfile && <SharedProfileCard profile={msg.sharedProfile} />}

                      <div className={`flex items-center gap-1.5 mt-1 ${isMe ? 'text-dark/60' : 'text-gray-custom'}`}>
                        <span className="text-xs">{timeAgo(msg.createdAt)}</span>
                        {msg.editedAt && <span className="text-xs italic">(edited)</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="px-3 py-3 border-t border-dark-lighter flex items-center gap-2 shrink-0">
          <input
            ref={inputRef}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Message..."
            className="flex-1 bg-dark border border-dark-lighter rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!messageText.trim() || sendMutation.isPending}
            className="w-10 h-10 flex items-center justify-center bg-primary hover:bg-primary-dark disabled:opacity-40 text-dark rounded-full transition-colors shrink-0"
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
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {showNewConv && NewConvModal}
      {forwardingId && (
        <ForwardModal messageId={forwardingId} onClose={() => setForwardingId(null)} />
      )}

      {/* ── Mobile layout ── */}
      <div className="md:hidden flex flex-col flex-1 min-h-0 bg-dark-light rounded-xl border border-dark-lighter overflow-hidden">
        {activeConvId ? ChatView : ConversationList}
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 gap-0">
        {/* Desktop header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h1 className="text-2xl font-bold">Messages</h1>
          <button
            onClick={() => setShowNewConv(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-dark font-semibold text-sm rounded-lg transition-colors"
          >
            <Plus size={16} />
            New Message
          </button>
        </div>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Sidebar */}
          <div className="w-72 shrink-0 bg-dark-light rounded-xl border border-dark-lighter flex flex-col overflow-hidden">
            <div className="flex bg-dark p-1 mx-3 mt-3 mb-1 rounded-lg shrink-0 border border-dark-lighter">
              <button
                onClick={() => { setShowArchived(false); setActiveConvId(null); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${!showArchived ? 'bg-dark-light text-white shadow-sm' : 'text-gray-custom hover:text-white'}`}
              >
                Active
              </button>
              <button
                onClick={() => { setShowArchived(true); setActiveConvId(null); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${showArchived ? 'bg-dark-light text-white shadow-sm' : 'text-gray-custom hover:text-white'}`}
              >
                Archived
              </button>
            </div>
            <div className="flex-1 overflow-y-auto mt-2">
              {conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <MessageCircle size={24} className="mx-auto mb-2 text-gray-custom" />
                  <p className="text-xs text-gray-custom">No {showArchived ? 'archived ' : ''}conversations.</p>
                </div>
              ) : conversations.map((conv: any) => {
                const isGroup = conv.isGroup;
                const other = getOther(conv);
                const isActive = conv.id === activeConvId;
                const online = !isGroup && getOnlineStatus(conv);
                const lastMsg = conv.messages?.[0];
                const lastPreview = lastMsg?.deletedAt
                  ? 'This message was deleted'
                  : lastMsg?.content ?? 'No messages yet';
                
                const title = isGroup ? conv.name : (other?.name ?? 'Unknown');
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConv(conv.id)}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                      isActive ? 'bg-primary/10 border-r-2 border-primary' : 'hover:bg-dark/40'
                    }`}
                  >
                    {isGroup ? (
                      <div className="w-10 h-10 bg-dark-lighter rounded-full flex items-center justify-center shrink-0 border border-dark/50">
                        <Users size={16} className="text-gray-custom" />
                      </div>
                    ) : (
                      <Avatar user={other} size={9} online={online} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{title}</p>
                      <p className={`text-xs truncate ${lastMsg?.deletedAt ? 'text-gray-custom italic' : 'text-gray-custom'}`}>
                        {lastPreview}
                      </p>
                    </div>
                    {lastMsg && (
                      <span className="text-xs text-gray-custom shrink-0">{timeAgo(lastMsg.createdAt)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat panel */}
          <div className="flex-1 bg-dark-light rounded-xl border border-dark-lighter flex flex-col overflow-hidden">
            {ChatView}
          </div>
        </div>
      </div>
    </div>
  );
}

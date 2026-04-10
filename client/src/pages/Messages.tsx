import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { io, type Socket } from 'socket.io-client';
import { auth } from '../config/firebase';
import { Send, MessageCircle, Plus, X, Search, ArrowLeft, Edit } from 'lucide-react';
import toast from 'react-hot-toast';

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

function Avatar({ user, size = 10 }: { user: any; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full bg-dark-lighter flex items-center justify-center font-bold shrink-0 overflow-hidden`;
  return (
    <div className={cls}>
      {user?.avatar
        ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
        : <span className="text-sm">{user?.name?.charAt(0)}</span>}
    </div>
  );
}

export default function Messages() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [showNewConv, setShowNewConv] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    auth.currentUser?.getIdToken().then((token) => {
      if (!mounted) return;
      const socketUrl = import.meta.env.VITE_API_URL || '/';
      socketRef.current = io(socketUrl, {
        auth: { token },
        transports: ['websocket'],
      });
    });
    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const { data: convData } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data } = await api.get('/messages/conversations');
      return data;
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!activeConvId) return;
    api.get(`/messages/conversations/${activeConvId}`).then(({ data }) => {
      setMessages(data.messages ?? []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
  }, [activeConvId]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
    s.on('message', (msg: any) => {
      if (msg.conversationId === activeConvId) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
      qc.invalidateQueries({ queryKey: ['conversations'] });
    });
    return () => { s.off('message'); };
  }, [activeConvId, qc]);

  useEffect(() => {
    if (!activeConvId || !socketRef.current) return;
    socketRef.current.emit('join_conversation', activeConvId);
    return () => { socketRef.current?.emit('leave_conversation', activeConvId); };
  }, [activeConvId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/messages/conversations/${activeConvId}`, { content: messageText });
      return data;
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, data.message]);
      setMessageText('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    },
    onError: () => toast.error('Failed to send'),
  });

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
    onError: () => toast.error('Could not start conversation'),
  });

  const conversations = convData?.conversations ?? [];
  const activeConv = conversations.find((c: any) => c.id === activeConvId);

  const getOther = (conv: any) =>
    conv.members?.find((p: any) => p.userId !== user?.id)?.user;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !activeConvId) return;
    sendMutation.mutate();
  };

  const openConv = (id: string) => {
    setActiveConvId(id);
    setTimeout(() => inputRef.current?.focus(), 100);
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

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <MessageCircle size={36} className="text-gray-custom" />
            <p className="text-gray-custom text-sm">No conversations yet.<br />Start one with the pencil icon above.</p>
          </div>
        ) : conversations.map((conv: any) => {
          const other = getOther(conv);
          const lastMsg = conv.messages?.[0];
          return (
            <button
              key={conv.id}
              onClick={() => openConv(conv.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark/40 active:bg-dark/60 transition-colors text-left border-b border-dark-lighter/30"
            >
              <Avatar user={other} size={12} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-sm font-semibold truncate">{other?.name ?? 'Unknown'}</p>
                  {lastMsg && <span className="text-xs text-gray-custom shrink-0">{timeAgo(lastMsg.createdAt)}</span>}
                </div>
                <p className="text-sm text-gray-custom truncate">
                  {lastMsg?.content ?? 'No messages yet'}
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
    const other = getOther(activeConv);
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
          <Avatar user={other} size={10} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{other?.name}</p>
            <p className="text-xs text-gray-custom">{other?.role}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {messages.map((msg: any, i: number) => {
            const isMe = msg.senderId === user?.id;
            return (
              <div key={msg.id ?? i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isMe ? 'bg-primary text-dark rounded-br-sm' : 'bg-dark-lighter text-white rounded-bl-sm'
                }`}>
                  <p className="text-sm leading-snug">{msg.content}</p>
                  <p className={`text-xs mt-1 ${isMe ? 'text-dark/60' : 'text-gray-custom'}`}>{timeAgo(msg.createdAt)}</p>
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
            <div className="p-3 border-b border-dark-lighter">
              <p className="text-xs text-gray-custom font-medium tracking-wide">CONVERSATIONS</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <MessageCircle size={24} className="mx-auto mb-2 text-gray-custom" />
                  <p className="text-xs text-gray-custom">No conversations yet</p>
                </div>
              ) : conversations.map((conv: any) => {
                const other = getOther(conv);
                const isActive = conv.id === activeConvId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConv(conv.id)}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                      isActive ? 'bg-primary/10 border-r-2 border-primary' : 'hover:bg-dark/40'
                    }`}
                  >
                    <Avatar user={other} size={9} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{other?.name ?? 'Unknown'}</p>
                      <p className="text-xs text-gray-custom truncate">{conv.messages?.[0]?.content ?? 'No messages yet'}</p>
                    </div>
                    {conv.messages?.[0] && (
                      <span className="text-xs text-gray-custom shrink-0">{timeAgo(conv.messages[0].createdAt)}</span>
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

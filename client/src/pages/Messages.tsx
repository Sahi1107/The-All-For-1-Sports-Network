import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import api from '../api/client';
import { io, Socket } from 'socket.io-client';
import { Send, MessageCircle, Plus, X, Search } from 'lucide-react';
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

export default function Messages() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [showNewConv, setShowNewConv] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize socket with a fresh Firebase ID token on mount, disconnect on unmount
  useEffect(() => {
    let mounted = true;
    auth.currentUser?.getIdToken().then((token) => {
      if (!mounted) return;
      socketRef.current = io('/', {
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
        setMessages(prev => [...prev, msg]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
      qc.invalidateQueries({ queryKey: ['conversations'] });
    });
    return () => { s.off('message'); };
  }, [activeConvId, qc]);

  useEffect(() => {
    if (!activeConvId) return;
    const s = socketRef.current;
    if (!s) return;
    s.emit('join_conversation', activeConvId);
    return () => { s.emit('leave_conversation', activeConvId); };
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

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Messages</h1>
        <button
          onClick={() => setShowNewConv(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-dark font-semibold text-sm rounded-lg transition-colors"
        >
          <Plus size={16} />
          New Message
        </button>
      </div>

      {showNewConv && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-light rounded-xl border border-dark-lighter w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-dark-lighter">
              <h2 className="font-semibold">New Conversation</h2>
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
                  className="w-full pl-8 pr-3 py-2 bg-dark border border-dark-lighter rounded-lg text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {(searchData?.users ?? []).filter((u: any) => u.id !== user?.id).map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => newConvMutation.mutate(u.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-dark transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-dark-lighter flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                      {u.avatar ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" /> : u.name?.charAt(0)}
                    </div>
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
      )}

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Conversations sidebar */}
        <div className="w-72 shrink-0 bg-dark-light rounded-xl border border-dark-lighter flex flex-col overflow-hidden">
          <div className="p-3 border-b border-dark-lighter">
            <p className="text-xs text-gray-custom font-medium">CONVERSATIONS</p>
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
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                    isActive ? 'bg-primary/10 border-r-2 border-primary' : 'hover:bg-dark/40'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-dark-lighter flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                    {other?.avatar ? <img src={other.avatar} alt={other.name} className="w-full h-full object-cover" /> : other?.name?.charAt(0)}
                  </div>
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

        {/* Chat area */}
        <div className="flex-1 bg-dark-light rounded-xl border border-dark-lighter flex flex-col overflow-hidden">
          {!activeConvId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle size={32} className="mx-auto mb-3 text-gray-custom" />
                <p className="text-gray-custom text-sm">Select a conversation to start chatting</p>
              </div>
            </div>
          ) : (
            <>
              {activeConv && (() => {
                const other = getOther(activeConv);
                return (
                  <div className="p-4 border-b border-dark-lighter flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-dark-lighter flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                      {other?.avatar ? <img src={other.avatar} alt={other.name} className="w-full h-full object-cover" /> : other?.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{other?.name}</p>
                      <p className="text-xs text-gray-custom">{other?.role}</p>
                    </div>
                  </div>
                );
              })()}

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg: any, i: number) => {
                  const isMe = msg.senderId === user?.id;
                  return (
                    <div key={msg.id ?? i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs lg:max-w-md rounded-2xl px-4 py-2 ${
                        isMe ? 'bg-primary text-dark rounded-br-sm' : 'bg-dark-lighter text-white rounded-bl-sm'
                      }`}>
                        <p className="text-sm">{msg.content}</p>
                        <p className={`text-xs mt-1 ${isMe ? 'text-dark/60' : 'text-gray-custom'}`}>{timeAgo(msg.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="p-4 border-t border-dark-lighter flex gap-3">
                <input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-dark border border-dark-lighter rounded-lg px-4 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!messageText.trim() || sendMutation.isPending}
                  className="p-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-dark rounded-lg transition-colors"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

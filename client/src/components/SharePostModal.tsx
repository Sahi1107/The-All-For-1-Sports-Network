import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  postId: string;
  onClose: () => void;
}

export default function SharePostModal({ postId, onClose }: Props) {
  const { user: me } = useAuth();
  const [connections, setConnections] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.id) return;
    api.get(`/users/${me.id}/following`)
      .then(({ data }) => setConnections(data.users ?? []))
      .catch(() => toast.error('Failed to load connections'))
      .finally(() => setLoading(false));
  }, [me?.id]);

  const handleSend = async (targetUser: any) => {
    if (sending || sentTo.has(targetUser.id)) return;
    setSending(targetUser.id);
    try {
      // Create or get existing conversation
      const { data: convData } = await api.post('/messages/conversations', { userId: targetUser.id });
      const conversationId = convData.conversation.id;
      // Send the shared post
      await api.post(`/messages/conversations/${conversationId}`, { sharedPostId: postId });
      setSentTo((prev) => new Set(prev).add(targetUser.id));
      toast.success(`Sent to ${targetUser.name}`);
    } catch {
      toast.error('Failed to send');
    } finally {
      setSending(null);
    }
  };

  const filtered = connections.filter((u: any) => {
    if (!search.trim()) return true;
    return u.name?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl border border-white/10 w-full sm:max-w-md max-h-[75vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white text-base">Share to...</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-white/30">
                {connections.length === 0
                  ? 'Follow people to share posts with them'
                  : 'No matches found'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((u: any) => {
                const isSent = sentTo.has(u.id);
                const isSending = sending === u.id;
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl"
                  >
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 ring-2 ring-white/10">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary-light">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                      <p className="text-xs text-white/40 capitalize truncate">
                        {u.sport?.toLowerCase()}{u.position ? ` · ${u.position}` : ''}
                      </p>
                    </div>

                    {/* Send button */}
                    <button
                      onClick={() => handleSend(u)}
                      disabled={isSending || isSent}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 ${
                        isSent
                          ? 'bg-white/10 text-white/40'
                          : 'bg-primary hover:bg-primary-dark text-dark'
                      } disabled:cursor-default`}
                    >
                      {isSending ? (
                        <div className="w-3.5 h-3.5 border-2 border-dark border-t-transparent rounded-full animate-spin mx-2" />
                      ) : isSent ? (
                        'Sent'
                      ) : (
                        'Send'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

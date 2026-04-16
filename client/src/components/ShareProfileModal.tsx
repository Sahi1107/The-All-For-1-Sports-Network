import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Search, Send, MessageCircle } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

interface Props {
  profileId: string;
  onClose: () => void;
}

export default function ShareProfileModal({ profileId, onClose }: Props) {
  const qc = useQueryClient();
  const [conversations, setConversations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    api.get('/messages/conversations')
      .then(({ data }) => setConversations(data.conversations ?? []))
      .catch(() => toast.error('Failed to load conversations'))
      .finally(() => setLoading(false));
  }, []);

  const sendMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      setSending(conversationId);
      const { data } = await api.post(`/messages/conversations/${conversationId}`, {
        sharedProfileId: profileId,
      });
      return data;
    },
    onSuccess: () => {
      toast.success('Profile shared!');
      qc.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    },
    onError: () => {
      toast.error('Failed to share profile');
      setSending(null);
    },
  });

  const filtered = conversations.filter((c: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.members?.some((m: any) => m.user?.name?.toLowerCase().includes(q));
  });

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-dark-light rounded-t-2xl sm:rounded-xl border border-dark-lighter w-full sm:max-w-sm max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-dark-lighter shrink-0">
          <h2 className="font-semibold">Send profile in message</h2>
          <button onClick={onClose} className="text-gray-custom hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 pb-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              autoFocus
              className="w-full pl-8 pr-3 py-2.5 bg-dark border border-dark-lighter rounded-xl text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle size={24} className="mx-auto mb-2 text-gray-custom" />
              <p className="text-sm text-gray-custom">
                {conversations.length === 0 ? 'No conversations yet. Start one first!' : 'No conversations match your search'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((conv: any) => {
                const other = conv.members?.find((m: any) => m.user);
                const otherUser = other?.user;
                const isSending = sending === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => sendMutation.mutate(conv.id)}
                    disabled={!!sending}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-dark transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-full bg-dark-lighter flex items-center justify-center font-bold shrink-0 overflow-hidden">
                      {otherUser?.avatar ? (
                        <img src={otherUser.avatar} alt={otherUser.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm">{otherUser?.name?.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{otherUser?.name ?? 'Unknown'}</p>
                    </div>
                    <div className="shrink-0">
                      {isSending ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send size={14} className="text-gray-custom" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

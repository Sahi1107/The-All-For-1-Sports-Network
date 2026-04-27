import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import api from '../api/client';

interface Props {
  postId: string;
  onClose: () => void;
}

export default function LikesModal({ postId, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['post-likes', postId],
    queryFn: async () => {
      const { data } = await api.get(`/posts/${postId}/likes`);
      return data;
    },
  });

  const users: any[] = data?.users ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-dark-light border border-white/10 rounded-xl w-full max-w-sm max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Heart size={15} className="text-red-400" fill="currentColor" />
            <span>Liked by</span>
            {users.length > 0 && <span className="text-white/40 font-normal">· {users.length}</span>}
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-white/30 text-sm py-8">No likes yet</p>
          ) : (
            users.map((u) => (
              <Link
                key={u.id}
                to={`/profile/${u.id}`}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                {u.avatar ? (
                  <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary-light shrink-0">
                    {u.name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-xs text-white/40 capitalize">
                    {u.role?.toLowerCase()}
                    {u.sport && u.role !== 'ADMIN' && ` · ${u.sport.toLowerCase().replace(/_/g, ' ')}`}
                    {u.position && ` · ${u.position}`}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

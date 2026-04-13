import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bookmark, Clock } from 'lucide-react';
import api from '../api/client';
import PostActions from '../components/PostActions';
import ImageCarousel from '../components/ImageCarousel';

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function SavedPosts() {
  const { data, isLoading } = useQuery({
    queryKey: ['saved-posts'],
    queryFn: async () => {
      const { data } = await api.get('/posts/saved');
      return data;
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Bookmark size={22} className="text-yellow-400" />
        Saved Posts
      </h1>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data?.posts?.length ? (
        <div className="text-center py-16">
          <Bookmark size={48} className="mx-auto text-white/20 mb-4" />
          <p className="text-white/50">No saved posts yet</p>
          <p className="text-sm text-white/30 mt-1">Bookmark posts from your feed to find them here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.posts.map((item: any) => (
            <div
              key={item.id}
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-xl"
            >
              {/* User header */}
              <div className="p-4 flex items-center gap-3">
                <Link to={`/profile/${item.user?.id}`}>
                  {item.user?.avatar ? (
                    <img src={item.user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary-light">
                      {item.user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="flex-1">
                  <Link
                    to={`/profile/${item.user?.id}`}
                    className="font-medium hover:text-primary-light transition-colors"
                  >
                    {item.user?.name}
                  </Link>
                  <p className="text-xs text-gray-custom flex items-center gap-2">
                    <span className="capitalize">{item.user?.role?.toLowerCase()}</span>
                    {item.user?.role !== 'ADMIN' && (
                      <>
                        <span>·</span>
                        <span className="capitalize">{item.sport?.toLowerCase()}</span>
                      </>
                    )}
                  </p>
                </div>
                <span className="text-xs text-gray-custom flex items-center gap-1">
                  <Clock size={12} />
                  {timeAgo(item.createdAt)}
                </span>
              </div>

              {/* Media */}
              {item.type === 'HIGHLIGHT' && item.mediaUrl && (
                <div className="relative bg-black aspect-video">
                  <video src={item.mediaUrl} controls preload="metadata" className="w-full h-full object-contain" />
                </div>
              )}
              {item.type === 'IMAGE' && (
                item.media?.length > 0 ? (
                  <ImageCarousel urls={item.media.map((m: any) => m.url)} alt={item.title || ''} />
                ) : item.mediaUrl ? (
                  <img src={item.mediaUrl} alt={item.title || ''} className="w-full max-h-[28rem] object-cover" />
                ) : null
              )}

              {/* Text */}
              <div className="p-4 pb-2">
                {item.title && <h3 className="font-semibold">{item.title}</h3>}
                {item.content && (
                  <p className="text-sm text-white/80 mt-1 leading-relaxed">{item.content}</p>
                )}
              </div>

              <PostActions post={item} invalidateKeys={[['saved-posts']]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

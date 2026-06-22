import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Clock } from 'lucide-react';
import ImageCarousel from './ImageCarousel';
import PostActions from './PostActions';
import { NameLine, PostMeta, PerformanceCard } from './feed/FeedBits';

interface Props {
  post: any;
  onClose: () => void;
  /** Extra query keys PostActions should invalidate after mutating (likes/comments). */
  invalidateKeys?: string[][];
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PostDetailModal({ post, onClose, invalidateKeys = [] }: Props) {
  // Lock body scroll while open and close on ESC.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-line rounded-none sm:rounded-2xl w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-line">
          <Link to={`/profile/${post.user?.id}`} onClick={onClose}>
            {post.user?.avatar ? (
              <img src={post.user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary-light">
                {post.user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
          </Link>
          <div className="flex-1 min-w-0">
            <Link
              to={`/profile/${post.user?.id}`}
              onClick={onClose}
              className="hover:text-primary-light transition-colors block min-w-0"
            >
              <NameLine name={post.user?.name} verified={post.user?.verified} />
            </Link>
            <PostMeta role={post.user?.role} sport={post.sport} position={post.user?.position} />
          </div>
          <span className="text-xs text-gray-custom flex items-center gap-1 shrink-0">
            <Clock size={12} />
            {timeAgo(post.createdAt)}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-2 p-1.5 text-gray-custom hover:text-foreground hover:bg-elevated rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Media */}
          {post.type === 'HIGHLIGHT' && post.mediaUrl && (
            <div className="relative bg-black">
              <video
                src={post.mediaUrl}
                controls
                preload="metadata"
                className="w-full max-h-[70vh] object-contain"
              />
            </div>
          )}

          {post.type === 'IMAGE' && (
            post.media?.length > 0
              ? <ImageCarousel urls={post.media.map((m: any) => m.url)} alt={post.title || ''} />
              : post.mediaUrl
                ? <img src={post.mediaUrl} alt={post.title || ''} className="w-full max-h-[70vh] object-contain bg-black" />
                : null
          )}

          {/* Performance moment — verified result as a stat card */}
          {post.type === 'PERFORMANCE' && post.performance && (
            <div className="p-4 pb-0">
              <PerformanceCard performance={post.performance} verified={post.user?.verified} />
            </div>
          )}

          {/* Caption */}
          {(post.title || post.content) && (
            <div className="p-4">
              {post.title && <h3 className="font-display font-bold text-lg mb-1">{post.title}</h3>}
              {post.content && (
                <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{post.content}</p>
              )}
            </div>
          )}

          {/* Actions + full comment thread */}
          <PostActions post={post} invalidateKeys={invalidateKeys} defaultExpanded />
        </div>
      </div>
    </div>
  );
}

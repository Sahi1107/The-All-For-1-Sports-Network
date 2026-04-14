import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Repeat2, Bookmark, Send, Trash2, CornerUpRight } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import SharePostModal from './SharePostModal';

interface Props {
  post: any;
  /** Additional query keys to invalidate on comment create/delete */
  invalidateKeys?: string[][];
}

export default function PostActions({ post, invalidateKeys = [] }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // Optimistic like state seeded from feed/profile data
  const [liked, setLiked] = useState<boolean>(post.likedByMe ?? false);
  const [likeCount, setLikeCount] = useState<number>(post.likeCount ?? 0);
  const [commentCount, setCommentCount] = useState<number>(post.commentCount ?? 0);
  const [reposted, setReposted] = useState<boolean>(post.repostedByMe ?? false);
  const [repostCount, setRepostCount] = useState<number>(post.repostCount ?? 0);
  const [saved, setSaved] = useState<boolean>(post.savedByMe ?? false);

  const likeMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post.id}/like`),
    onMutate: () => {
      setLiked((prev) => !prev);
      setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
    },
    onSuccess: ({ data }) => {
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    },
    onError: () => {
      setLiked((prev) => !prev);
      setLikeCount((prev) => (liked ? prev + 1 : prev - 1));
    },
  });

  const repostMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post.id}/repost`),
    onMutate: () => {
      setReposted((prev) => !prev);
      setRepostCount((prev) => (reposted ? prev - 1 : prev + 1));
    },
    onSuccess: ({ data }) => {
      setReposted(data.reposted);
      setRepostCount(data.repostCount);
    },
    onError: () => {
      setReposted((prev) => !prev);
      setRepostCount((prev) => (reposted ? prev + 1 : prev - 1));
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post.id}/save`),
    onMutate: () => {
      setSaved((prev) => !prev);
    },
    onSuccess: ({ data }) => {
      setSaved(data.saved);
    },
    onError: () => {
      setSaved((prev) => !prev);
    },
  });

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const { data } = await api.get(`/posts/${post.id}/comments`);
      setComments(data.comments);
    } finally {
      setLoadingComments(false);
    }
  };

  const toggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments((v) => !v);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['feed'] });
    for (const key of invalidateKeys) {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  const submitComment = async () => {
    const content = commentText.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/posts/${post.id}/comments`, { content });
      setComments((prev) => [...prev, data.comment]);
      setCommentText('');
      setCommentCount((c) => c + 1);
      invalidate();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    await api.delete(`/posts/${post.id}/comments/${commentId}`);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setCommentCount((c) => Math.max(0, c - 1));
    invalidate();
  };

  return (
    <>
      <div>
        {/* Action bar */}
        <div className="flex items-center gap-5 px-4 pb-3 pt-1">
          <button
            onClick={() => likeMutation.mutate()}
            className={`flex items-center gap-1.5 text-sm transition-colors ${liked ? 'text-red-400' : 'text-white/40 hover:text-white/70'}`}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
            {likeCount > 0 && <span>{likeCount}</span>}
          </button>
          <button
            onClick={toggleComments}
            className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            <MessageCircle size={16} />
            {commentCount > 0 && <span>{commentCount}</span>}
          </button>
          <button
            onClick={() => repostMutation.mutate()}
            className={`flex items-center gap-1.5 text-sm transition-colors ${reposted ? 'text-green-400' : 'text-white/40 hover:text-white/70'}`}
          >
            <Repeat2 size={16} />
            {repostCount > 0 && <span>{repostCount}</span>}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-primary transition-colors"
              title="Send in message"
            >
              <CornerUpRight size={16} />
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              className={`flex items-center gap-1.5 text-sm transition-colors ${saved ? 'text-yellow-400' : 'text-white/40 hover:text-white/70'}`}
            >
              <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {/* Comments section */}
        {showComments && (
          <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
            {loadingComments ? (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-white/30 text-center py-1">No comments yet</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 group">
                    <Link to={`/profile/${c.user.id}`} className="shrink-0">
                      {c.user.avatar ? (
                        <img src={c.user.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary-light">
                          {c.user.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 bg-white/5 rounded-lg px-2.5 py-1.5">
                      <Link
                        to={`/profile/${c.user.id}`}
                        className="text-xs font-semibold text-white hover:text-primary-light transition-colors"
                      >
                        {c.user.name}
                      </Link>
                      <p className="text-xs text-white/70 mt-0.5 leading-relaxed">{c.content}</p>
                    </div>
                    {(c.user.id === user?.id || post.user?.id === user?.id) && (
                      <button
                        onClick={() => deleteComment(c.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-red-400 mt-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Comment input */}
            <div className="flex items-center gap-2 mt-2">
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary-light shrink-0">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitComment();
                  }
                }}
                placeholder="Add a comment…"
                maxLength={500}
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-primary"
              />
              <button
                onClick={submitComment}
                disabled={!commentText.trim() || submitting}
                className="text-primary disabled:text-white/20 transition-colors"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showShare && <SharePostModal postId={post.id} onClose={() => setShowShare(false)} />}
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Repeat2, Bookmark, Send, Trash2, CornerUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import SharePostModal from './SharePostModal';

interface Props {
  post: any;
  /** Additional query keys to invalidate on comment create/delete */
  invalidateKeys?: string[][];
}

function CommentItem({
  c,
  postId,
  postOwnerId,
  depth,
  onDelete,
  onReply,
}: {
  c: any;
  postId: string;
  postOwnerId?: string;
  depth: number;
  onDelete: (id: string) => void;
  onReply: (commentId: string, userName: string) => void;
}) {
  const { user } = useAuth();
  const [liked, setLiked] = useState<boolean>(c.likedByMe ?? false);
  const [likeCount, setLikeCount] = useState<number>(c.likeCount ?? 0);
  const [showReplies, setShowReplies] = useState(false);
  const replies: any[] = c.replies ?? [];

  const toggleLike = async () => {
    setLiked((p: boolean) => !p);
    setLikeCount((p: number) => liked ? p - 1 : p + 1);
    try {
      const { data } = await api.post(`/posts/${postId}/comments/${c.id}/like`);
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    } catch {
      setLiked((p: boolean) => !p);
      setLikeCount((p: number) => liked ? p + 1 : p - 1);
    }
  };

  return (
    <div className={depth > 0 ? 'ml-6 border-l border-white/5 pl-3' : ''}>
      <div className="flex items-start gap-2 group">
        <Link to={`/profile/${c.user.id}`} className="shrink-0">
          {c.user.avatar ? (
            <img src={c.user.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary-light">
              {c.user.name?.charAt(0).toUpperCase()}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
            <Link
              to={`/profile/${c.user.id}`}
              className="text-xs font-semibold text-white hover:text-primary-light transition-colors"
            >
              {c.user.name}
            </Link>
            <p className="text-xs text-white/70 mt-0.5 leading-relaxed">{c.content}</p>
          </div>
          <div className="flex items-center gap-3 mt-1 px-1">
            <button
              onClick={toggleLike}
              className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${liked ? 'text-red-400' : 'text-white/60 hover:text-red-400'}`}
            >
              <Heart size={12} fill={liked ? 'currentColor' : 'none'} />
              <span>{liked ? 'Liked' : 'Like'}</span>
              {likeCount > 0 && <span className="text-white/50">· {likeCount}</span>}
            </button>
            {depth === 0 && (
              <button
                onClick={() => onReply(c.id, c.user.name)}
                className="text-[11px] font-medium text-white/60 hover:text-primary-light transition-colors"
              >
                Reply
              </button>
            )}
            {(c.user.id === user?.id || postOwnerId === user?.id) && (
              <button
                onClick={() => onDelete(c.id)}
                className="text-[11px] text-white/40 hover:text-red-400 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies toggle */}
      {depth === 0 && replies.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="flex items-center gap-1 text-[11px] text-primary-light hover:text-primary ml-8 mb-1"
          >
            {showReplies ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </button>
          {showReplies && (
            <div className="space-y-2">
              {replies.map((r: any) => (
                <CommentItem
                  key={r.id}
                  c={r}
                  postId={postId}
                  postOwnerId={postOwnerId}
                  depth={1}
                  onDelete={onDelete}
                  onReply={onReply}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);

  // Optimistic like state seeded from feed/profile data
  const [liked, setLiked] = useState<boolean>(post.likedByMe ?? false);
  const [likeCount, setLikeCount] = useState<number>(post.likeCount ?? 0);
  const [commentCount, setCommentCount] = useState<number>(post.commentCount ?? 0);
  const [reposted, setReposted] = useState<boolean>(post.repostedByMe ?? false);
  const [repostCount, setRepostCount] = useState<number>(post.repostCount ?? 0);
  const [saved, setSaved] = useState<boolean>(post.savedByMe ?? false);

  const commentsDisabled = post.commentsDisabled ?? false;

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
      const { data } = await api.post(`/posts/${post.id}/comments`, {
        content,
        parentId: replyingTo?.id ?? undefined,
      });
      if (replyingTo) {
        // Add reply to the parent comment
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyingTo.id
              ? { ...c, replies: [...(c.replies ?? []), data.comment], replyCount: (c.replyCount ?? 0) + 1 }
              : c,
          ),
        );
      } else {
        setComments((prev) => [...prev, data.comment]);
      }
      setCommentText('');
      setReplyingTo(null);
      setCommentCount((c) => c + 1);
      invalidate();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    await api.delete(`/posts/${post.id}/comments/${commentId}`);
    // Remove from top-level or from replies
    setComments((prev) => {
      const filtered = prev.filter((c) => c.id !== commentId);
      return filtered.map((c) => ({
        ...c,
        replies: (c.replies ?? []).filter((r: any) => r.id !== commentId),
        replyCount: (c.replies ?? []).filter((r: any) => r.id !== commentId).length,
      }));
    });
    setCommentCount((c) => Math.max(0, c - 1));
    invalidate();
  };

  const handleReply = (commentId: string, userName: string) => {
    setReplyingTo({ id: commentId, name: userName });
    setCommentText(`@${userName} `);
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
          {!commentsDisabled && (
            <button
              onClick={toggleComments}
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              <MessageCircle size={16} />
              {commentCount > 0 && <span>{commentCount}</span>}
            </button>
          )}
          {commentsDisabled && (
            <span className="flex items-center gap-1.5 text-sm text-white/20 cursor-default" title="Comments disabled">
              <MessageCircle size={16} />
            </span>
          )}
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
        {showComments && !commentsDisabled && (
          <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
            {loadingComments ? (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-white/30 text-center py-1">No comments yet</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {comments.map((c) => (
                  <CommentItem
                    key={c.id}
                    c={c}
                    postId={post.id}
                    postOwnerId={post.user?.id}
                    depth={0}
                    onDelete={deleteComment}
                    onReply={handleReply}
                  />
                ))}
              </div>
            )}

            {/* Reply indicator */}
            {replyingTo && (
              <div className="flex items-center gap-2 px-1 text-xs text-primary-light">
                <span>Replying to {replyingTo.name}</span>
                <button onClick={() => { setReplyingTo(null); setCommentText(''); }} className="text-white/40 hover:text-white">
                  ×
                </button>
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
                placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : 'Add a comment…'}
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

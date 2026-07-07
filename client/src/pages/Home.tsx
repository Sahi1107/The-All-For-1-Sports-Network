import BallLoader from '../components/BallLoader';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, MapPin, Clock, X, Search } from 'lucide-react';
import api from '../api/client';
import { useEffect, useRef, useState } from 'react';
import ImageCarousel from '../components/ImageCarousel';
import PostActions from '../components/PostActions';
import PostDetailModal from '../components/PostDetailModal';
import { SPORTS } from '../data/sports';
import { SPORT_BACKDROP } from '../components/SportBackdrop';
import { NameLine, PostMeta, PerformanceCard } from '../components/feed/FeedBits';

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

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'highlights', label: 'Highlights' },
  { value: 'performances', label: 'Performances' },
  { value: 'tournaments', label: 'Tournaments' },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

function matchesFilter(item: any, filter: FilterValue) {
  switch (filter) {
    case 'highlights':
      return item.kind === 'highlight' || item.type === 'HIGHLIGHT';
    case 'performances':
      return item.type === 'PERFORMANCE';
    case 'tournaments':
      return !!item.tournament;
    default:
      return true;
  }
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [openPost, setOpenPost] = useState<any | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [searchText, setSearchText] = useState('');

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    navigate(q ? `/explore?search=${encodeURIComponent(q)}` : '/explore');
  };

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await api.get(`/feed?page=${pageParam}&limit=20`);
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });

  const allItems: any[] = data?.pages.flatMap((p) => p.feed ?? []) ?? [];
  const feedItems = allItems.filter((item) => matchesFilter(item, filter));

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root, rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, feedItems.length]);

  const [searchParams, setSearchParams] = useSearchParams();
  const previewSportParam = searchParams.get('previewSport');
  const previewSport =
    user?.role === 'ADMIN' && previewSportParam && SPORT_BACKDROP[previewSportParam]
      ? previewSportParam
      : null;
  const previewLabel = previewSport
    ? SPORTS.find((s) => s.value === previewSport)?.label ?? previewSport
    : null;

  const effectiveSport = previewSport ?? (user?.role !== 'ADMIN' ? user?.sport ?? '' : '');
  const Backdrop = SPORT_BACKDROP[effectiveSport];

  return (
    <div className="relative md:overflow-hidden">
      {/* Sport line-art watermark — fixed inside the content panel so it stays
         behind the feed for the user's sport as the page scrolls. Falls back to
         ambient concentric circles when the sport has no device. */}
      {Backdrop ? (
        <div className="sport-backdrop hidden md:block fixed top-3 bottom-3 right-3 left-[92px] rounded-[26px] overflow-hidden pointer-events-none select-none z-0">
          <Backdrop />
        </div>
      ) : (
        <div aria-hidden className="hidden md:block absolute -top-24 -right-24 pointer-events-none select-none">
          <div className="w-[420px] h-[420px] rounded-full border border-ink/[0.06]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] rounded-full border border-ink/[0.05]" />
        </div>
      )}

      <div className="relative z-10">
        {/* ── Page header ─────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display font-extrabold text-3xl md:text-4xl tracking-tight">Home</h1>
            <p className="text-gray-custom text-sm mt-1.5">Latest from the athletes and coaches you follow</p>
          </div>
          <form onSubmit={submitSearch} className="lg:w-72 shrink-0">
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-ink/5 border border-ink/10 focus-within:border-primary/50 transition-colors">
              <Search size={16} className="text-gray-custom shrink-0" />
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search athletes, teams..."
                className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder-gray-custom focus:outline-none"
              />
            </div>
          </form>
        </div>

        {/* ── Filter chips ────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'bg-ink/5 text-gray-custom hover:bg-ink/10 hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {previewSport && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-purple-500/10 border border-purple-400/30 rounded-xl px-4 py-3 text-sm">
            <span className="text-foreground/80">
              <span className="text-purple-300 font-semibold">Admin preview</span> — viewing the feed as a{' '}
              <span className="text-foreground font-medium">{previewLabel}</span> athlete.
            </span>
            <button
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('previewSport');
                setSearchParams(next, { replace: true });
              }}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs text-purple-200 hover:text-foreground border border-purple-400/30 hover:border-purple-300 rounded-lg transition-colors"
            >
              <X size={13} /> Exit preview
            </button>
          </div>
        )}

        {/* Prompt for users who haven't set their location yet */}
        {!isLoading && user && !user.location && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 text-sm">
            <span className="text-foreground/80">
              <span className="text-primary font-semibold">Complete your profile</span> — add your country, state, and city so others can find you.
            </span>
            <Link to="/profile/edit" className="shrink-0 px-3 py-1.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors text-xs">
              Edit Profile
            </Link>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <BallLoader />
          </div>
        ) : feedItems.length === 0 ? (
          allItems.length > 0 ? (
            <div className="bg-ink/5 backdrop-blur-md border border-ink/10 rounded-xl p-12 text-center">
              <p className="text-gray-custom text-lg">Nothing here yet</p>
              <p className="text-sm text-gray-custom mt-2">No {filter} in your feed right now.</p>
              <button
                onClick={() => setFilter('all')}
                className="inline-block mt-4 px-6 py-2 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors"
              >
                Show all
              </button>
            </div>
          ) : (
            <div className="bg-ink/5 backdrop-blur-md border border-ink/10 rounded-xl p-12 text-center shadow-xl">
              <p className="text-gray-custom text-lg">Your feed is empty</p>
              <p className="text-sm text-gray-custom mt-2">Follow athletes and coaches to see their posts here</p>
              <Link
                to="/explore"
                className="inline-block mt-4 px-6 py-2 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors"
              >
                Explore Athletes
              </Link>
            </div>
          )
        ) : (
          <div ref={scrollRef} className="flex flex-col items-center gap-4 py-4">
            {feedItems.map((item: any) => (
              <div
                key={`${item.kind}-${item.id}`}
                className="w-full max-w-2xl"
              >
                <div className="bg-ink/5 backdrop-blur-md border border-ink/10 rounded-xl overflow-hidden shadow-xl">
                  {/* User header — name + verification lead, one disciplined meta line */}
                  <div className="p-4 flex items-center gap-3">
                    <Link to={`/profile/${item.user?.id}`}>
                      {item.user?.avatar ? (
                        <img src={item.user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-display font-bold text-primary-light">
                          {item.user?.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/profile/${item.user?.id}`}
                        className="hover:text-primary-light transition-colors block min-w-0"
                      >
                        <NameLine name={item.user?.name} verified={item.user?.verified} />
                      </Link>
                      <PostMeta role={item.user?.role} sport={item.sport} position={item.user?.position} />
                    </div>
                    <span className="text-xs text-gray-custom flex items-center gap-1 shrink-0">
                      <Clock size={12} />
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>

                  {/* Media content — varies by type */}
                  {item.kind === 'highlight' && item.videoUrl && (
                    <div className="relative bg-black aspect-video">
                      <video
                        src={item.videoUrl}
                        controls
                        preload="metadata"
                        className="w-full h-full object-contain"
                        poster={item.thumbnailUrl}
                      />
                      {/* Verified rating + views surfaced on the frame */}
                      {typeof item.views === 'number' && (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur-sm px-2 py-1 text-[11px] text-white/90 pointer-events-none">
                          <Eye size={12} /> {item.views.toLocaleString()} views
                        </span>
                      )}
                    </div>
                  )}

                  {item.kind === 'post' && item.type === 'HIGHLIGHT' && item.mediaUrl && (
                    <div className="relative bg-black aspect-video">
                      <video
                        src={item.mediaUrl}
                        controls
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}

                  {item.kind === 'post' && item.type === 'IMAGE' && (
                    <div
                      onClick={() => setOpenPost(item)}
                      className="cursor-pointer"
                    >
                      {item.media?.length > 0 ? (
                        <ImageCarousel urls={item.media.map((m: any) => m.url)} alt={item.title || ''} />
                      ) : item.mediaUrl ? (
                        <img src={item.mediaUrl} alt={item.title || ''} className="w-full max-h-[32rem] object-contain bg-black" />
                      ) : null}
                    </div>
                  )}

                  {/* Text content / details */}
                  <div
                    className={`p-4 pb-2 ${item.kind === 'post' ? 'cursor-pointer' : ''}`}
                    onClick={item.kind === 'post' ? () => setOpenPost(item) : undefined}
                  >
                    {/* Performance moment — verified result as a stat card, not plain text */}
                    {item.kind === 'post' && item.type === 'PERFORMANCE' && item.performance && (
                      <div className="mb-3">
                        <PerformanceCard performance={item.performance} verified={item.user?.verified} />
                      </div>
                    )}
                    {item.title && <h3 className="font-display font-bold text-[15px] leading-snug">{item.title}</h3>}
                    {(item.content || item.description) && (
                      <p className="text-sm text-foreground/80 mt-1 leading-relaxed">{item.content || item.description}</p>
                    )}
                    {item.tournament && (
                      <div className="flex items-center gap-1 mt-3 text-xs text-gray-custom">
                        <MapPin size={14} /> {item.tournament.name}
                      </div>
                    )}
                  </div>

                  {/* Likes & comments — posts only */}
                  {item.kind === 'post' && <PostActions post={item} />}
                </div>
              </div>
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-8">
                <BallLoader />
              </div>
            )}
          </div>
        )}
      </div>

      {openPost && (
        <PostDetailModal
          post={openPost}
          onClose={() => setOpenPost(null)}
          invalidateKeys={[['feed']]}
        />
      )}
    </div>
  );
}

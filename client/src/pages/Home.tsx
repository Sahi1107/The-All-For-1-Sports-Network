import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, MapPin, Clock } from 'lucide-react';
import api from '../api/client';
import { useEffect, useRef } from 'react';
import React from 'react';
import ImageCarousel from '../components/ImageCarousel';
import PostActions from '../components/PostActions';

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

function BasketballBackdrop() {
  return (
    <svg
      viewBox="0 0 940 520"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <g stroke="white" fill="none" strokeWidth="1.8" opacity="0.18">
        <rect x="20" y="20" width="900" height="480" />
        <line x1="470" y1="20" x2="470" y2="500" />
        <circle cx="470" cy="260" r="57" />
        <line x1="58" y1="231" x2="58" y2="289" strokeWidth="3.5" />
        <circle cx="70" cy="260" r="10" />
        <rect x="20" y="183" width="182" height="154" />
        <line x1="63"  y1="183" x2="63"  y2="171" />
        <line x1="90"  y1="183" x2="90"  y2="171" />
        <line x1="130" y1="183" x2="130" y2="171" />
        <line x1="157" y1="183" x2="157" y2="171" />
        <line x1="63"  y1="337" x2="63"  y2="349" />
        <line x1="90"  y1="337" x2="90"  y2="349" />
        <line x1="130" y1="337" x2="130" y2="349" />
        <line x1="157" y1="337" x2="157" y2="349" />
        <path d="M202,203 A57,57 0 0 1 202,317" />
        <path d="M202,203 A57,57 0 0 0 202,317" strokeDasharray="5 4" />
        <line x1="20"  y1="49"  x2="154" y2="49"  />
        <line x1="20"  y1="471" x2="154" y2="471" />
        <path d="M154,49 A227,227 0 0 1 154,471" />
        <path d="M70,222 A38,38 0 0 1 70,298" strokeDasharray="4 3" />
        <line x1="882" y1="231" x2="882" y2="289" strokeWidth="3.5" />
        <circle cx="870" cy="260" r="10" />
        <rect x="738" y="183" width="182" height="154" />
        <line x1="877" y1="183" x2="877" y2="171" />
        <line x1="850" y1="183" x2="850" y2="171" />
        <line x1="810" y1="183" x2="810" y2="171" />
        <line x1="783" y1="183" x2="783" y2="171" />
        <line x1="877" y1="337" x2="877" y2="349" />
        <line x1="850" y1="337" x2="850" y2="349" />
        <line x1="810" y1="337" x2="810" y2="349" />
        <line x1="783" y1="337" x2="783" y2="349" />
        <path d="M738,203 A57,57 0 0 0 738,317" />
        <path d="M738,203 A57,57 0 0 1 738,317" strokeDasharray="5 4" />
        <line x1="786" y1="49"  x2="920" y2="49"  />
        <line x1="786" y1="471" x2="920" y2="471" />
        <path d="M786,49 A227,227 0 0 0 786,471" />
        <path d="M870,222 A38,38 0 0 0 870,298" strokeDasharray="4 3" />
      </g>
    </svg>
  );
}

function FootballBackdrop() {
  return (
    <svg
      viewBox="0 0 800 500"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <g stroke="white" fill="none" strokeWidth="1.5" opacity="0.18">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="400" y1="30" x2="400" y2="470" />
        <circle cx="400" cy="250" r="65" />
        <circle cx="400" cy="250" r="4" fill="white" stroke="none" />
        <rect x="30" y="120" width="116" height="260" />
        <rect x="30" y="191" width="39" height="118" />
        <rect x="10" y="221" width="20" height="58" />
        <circle cx="108" cy="250" r="3" fill="white" stroke="none" />
        <path d="M146,197 A65,65 0 0 1 146,303" />
        <rect x="654" y="120" width="116" height="260" />
        <rect x="731" y="191" width="39" height="118" />
        <rect x="770" y="221" width="20" height="58" />
        <circle cx="692" cy="250" r="3" fill="white" stroke="none" />
        <path d="M654,197 A65,65 0 0 0 654,303" />
        <path d="M30,50 Q30,30 50,30" />
        <path d="M750,30 Q770,30 770,50" />
        <path d="M770,450 Q770,470 750,470" />
        <path d="M50,470 Q30,470 30,450" />
      </g>
    </svg>
  );
}

function CricketBackdrop() {
  return (
    <svg
      viewBox="0 0 800 500"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <g stroke="white" fill="none" strokeWidth="1.8" opacity="0.18">
        <ellipse cx="400" cy="250" rx="362" ry="228" />
        <ellipse cx="400" cy="250" rx="192" ry="170" />
        <rect x="311" y="239" width="178" height="22" fill="white" fillOpacity="0.09" strokeWidth="1.2" />
        <line x1="311" y1="224" x2="311" y2="276" />
        <line x1="326" y1="207" x2="326" y2="293" />
        <line x1="296" y1="224" x2="326" y2="224" />
        <line x1="296" y1="276" x2="326" y2="276" />
        <circle cx="315" cy="243" r="3" fill="white" stroke="none" />
        <circle cx="315" cy="250" r="3" fill="white" stroke="none" />
        <circle cx="315" cy="257" r="3" fill="white" stroke="none" />
        <line x1="489" y1="224" x2="489" y2="276" />
        <line x1="474" y1="207" x2="474" y2="293" />
        <line x1="474" y1="224" x2="504" y2="224" />
        <line x1="474" y1="276" x2="504" y2="276" />
        <circle cx="485" cy="243" r="3" fill="white" stroke="none" />
        <circle cx="485" cy="250" r="3" fill="white" stroke="none" />
        <circle cx="485" cy="257" r="3" fill="white" stroke="none" />
      </g>
    </svg>
  );
}

const SPORT_BACKDROP: Record<string, () => React.ReactElement> = {
  BASKETBALL: BasketballBackdrop,
  FOOTBALL: FootballBackdrop,
  CRICKET: CricketBackdrop,
};

export default function Home() {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  const feedItems: any[] = data?.pages.flatMap((p) => p.feed ?? []) ?? [];

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

  const Backdrop = user?.role !== 'ADMIN' ? SPORT_BACKDROP[user?.sport ?? ''] : undefined;

  return (
    <div className="-mx-4 -my-4 md:-mx-6 md:-my-6">
      {Backdrop && (
        <div className="hidden md:block fixed top-0 bottom-0 right-0 pointer-events-none select-none z-[1]" style={{ left: '256px' }}>
          <Backdrop />
        </div>
      )}

      <div className="relative z-10">
        {/* Prompt for users who haven't set their location yet */}
        {!isLoading && user && !user.location && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 text-sm">
            <span className="text-white/80">
              <span className="text-primary font-semibold">Complete your profile</span> — add your country, state, and city so others can find you.
            </span>
            <Link to="/profile/edit" className="shrink-0 px-3 py-1.5 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors text-xs">
              Edit Profile
            </Link>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : feedItems.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-12 text-center shadow-xl">
            <p className="text-gray-custom text-lg">Your feed is empty</p>
            <p className="text-sm text-gray-custom mt-2">Follow athletes and coaches to see their posts here</p>
            <Link
              to="/explore"
              className="inline-block mt-4 px-6 py-2 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors"
            >
              Explore Athletes
            </Link>
          </div>
        ) : (
          <div ref={scrollRef} className="flex flex-col items-center gap-4 py-4">
            {feedItems.map((item: any) => (
              <div
                key={`${item.kind}-${item.id}`}
                className="w-full max-w-2xl"
              >
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-xl">
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
                        {item.user?.position && item.user?.role !== 'ADMIN' && (
                          <><span>·</span><span>{item.user.position}</span></>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-gray-custom flex items-center gap-1">
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
                    item.media?.length > 0 ? (
                      <ImageCarousel urls={item.media.map((m: any) => m.url)} alt={item.title || ''} />
                    ) : item.mediaUrl ? (
                      <img src={item.mediaUrl} alt={item.title || ''} className="w-full max-h-[32rem] object-contain bg-black" />
                    ) : null
                  )}

                  {/* Text content / details */}
                  <div className="p-4 pb-2">
                    {item.title && <h3 className="font-semibold">{item.title}</h3>}
                    {(item.content || item.description) && (
                      <p className="text-sm text-white/80 mt-1 leading-relaxed">{item.content || item.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-custom">
                      {item.kind === 'highlight' && (
                        <span className="flex items-center gap-1">
                          <Eye size={14} /> {item.views} views
                        </span>
                      )}
                      {item.tournament && (
                        <span className="flex items-center gap-1">
                          <MapPin size={14} /> {item.tournament.name}
                        </span>
                      )}
                    </div>
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
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

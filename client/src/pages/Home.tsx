import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, MapPin, Clock, X } from 'lucide-react';
import api from '../api/client';
import { useEffect, useRef, useState } from 'react';
import React from 'react';
import ImageCarousel from '../components/ImageCarousel';
import PostActions from '../components/PostActions';
import PostDetailModal from '../components/PostDetailModal';
import { SPORTS } from '../data/sports';
import weightlifterSilhouetteUrl from '../assets/weightlifter-silhouette.svg';

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

function FieldHockeyBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="400" y1="30" x2="400" y2="470" />
        <line x1="190" y1="30" x2="190" y2="470" strokeDasharray="6 4" />
        <line x1="610" y1="30" x2="610" y2="470" strokeDasharray="6 4" />
        <path d="M30,160 A140,140 0 0 1 30,340" />
        <path d="M770,160 A140,140 0 0 0 770,340" />
        <rect x="15" y="225" width="15" height="50" />
        <rect x="770" y="225" width="15" height="50" />
        <circle cx="120" cy="250" r="3" fill="white" stroke="none" />
        <circle cx="680" cy="250" r="3" fill="white" stroke="none" />
      </g>
    </svg>
  );
}

function BadmintonBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="400" y1="30" x2="400" y2="470" strokeWidth="2.5" />
        <line x1="30" y1="60" x2="770" y2="60" />
        <line x1="30" y1="440" x2="770" y2="440" />
        <line x1="290" y1="30" x2="290" y2="470" />
        <line x1="510" y1="30" x2="510" y2="470" />
        <line x1="80" y1="30" x2="80" y2="470" />
        <line x1="720" y1="30" x2="720" y2="470" />
        <line x1="80" y1="250" x2="290" y2="250" />
        <line x1="510" y1="250" x2="720" y2="250" />
      </g>
    </svg>
  );
}

function AthleticsBackdrop() {
  return (
    <svg viewBox="0 0 940 520" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <ellipse cx="470" cy="260" rx="430" ry="220" />
        <ellipse cx="470" cy="260" rx="380" ry="170" />
        <ellipse cx="470" cy="260" rx="420" ry="210" strokeDasharray="8 6" />
        <ellipse cx="470" cy="260" rx="410" ry="200" strokeDasharray="8 6" />
        <ellipse cx="470" cy="260" rx="400" ry="190" strokeDasharray="8 6" />
        <ellipse cx="470" cy="260" rx="390" ry="180" strokeDasharray="8 6" />
        <line x1="470" y1="40" x2="470" y2="90" strokeWidth="3" />
      </g>
    </svg>
  );
}

function WrestlingBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="20" y="20" width="760" height="460" />
        <circle cx="400" cy="250" r="225" />
        <circle cx="400" cy="250" r="200" />
        <circle cx="400" cy="250" r="165" strokeDasharray="6 5" />
        <circle cx="400" cy="250" r="45" strokeWidth="2" />
        <circle cx="400" cy="250" r="4" fill="white" stroke="none" />
      </g>
    </svg>
  );
}

function BoxingBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        {/* Ring floor in perspective (trapezoid) */}
        <path d="M 60 460 L 740 460 L 560 240 L 240 240 Z" />
        {/* Front posts */}
        <line x1="60" y1="460" x2="60" y2="200" strokeWidth="2.5" />
        <line x1="740" y1="460" x2="740" y2="200" strokeWidth="2.5" />
        {/* Back posts */}
        <line x1="240" y1="240" x2="240" y2="135" strokeWidth="2" />
        <line x1="560" y1="240" x2="560" y2="135" strokeWidth="2" />
        {/* Back corner pads */}
        <rect x="232" y="125" width="16" height="22" />
        <rect x="552" y="125" width="16" height="22" />
        {/* Side ropes — three rows fanning back into perspective */}
        <line x1="60" y1="245" x2="240" y2="200" />
        <line x1="60" y1="285" x2="240" y2="215" />
        <line x1="60" y1="325" x2="240" y2="230" />
        <line x1="740" y1="245" x2="560" y2="200" />
        <line x1="740" y1="285" x2="560" y2="215" />
        <line x1="740" y1="325" x2="560" y2="230" />
        {/* Back ropes */}
        <line x1="240" y1="200" x2="560" y2="200" />
        <line x1="240" y1="215" x2="560" y2="215" />
        <line x1="240" y1="230" x2="560" y2="230" />
        {/* Center back pad */}
        <rect x="378" y="178" width="44" height="52" />
        <line x1="378" y1="195" x2="422" y2="195" />
        <line x1="378" y1="212" x2="422" y2="212" />
      </g>
    </svg>
  );
}

function ShootingBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="170" y="20" width="460" height="460" />
        <circle cx="400" cy="250" r="220" />
        <circle cx="400" cy="250" r="195" />
        <circle cx="400" cy="250" r="170" />
        <circle cx="400" cy="250" r="145" />
        <circle cx="400" cy="250" r="120" />
        <circle cx="400" cy="250" r="95" />
        <circle cx="400" cy="250" r="70" />
        <circle cx="400" cy="250" r="45" />
        <circle cx="400" cy="250" r="22" />
        <line x1="400" y1="20" x2="400" y2="480" strokeDasharray="5 4" strokeWidth="1" />
        <line x1="170" y1="250" x2="630" y2="250" strokeDasharray="5 4" strokeWidth="1" />
        <circle cx="400" cy="250" r="3" fill="white" stroke="none" />
      </g>
    </svg>
  );
}

function WeightliftingBackdrop() {
  return (
    <img
      src={weightlifterSilhouetteUrl}
      alt=""
      className="w-full h-full object-contain opacity-[0.18]"
      style={{ filter: 'brightness(0) invert(1)' }}
    />
  );
}

function ArcheryBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="white" fill="none" strokeWidth="1.8" opacity="0.18">
        <circle cx="400" cy="250" r="220" />
        <circle cx="400" cy="250" r="198" />
        <circle cx="400" cy="250" r="176" />
        <circle cx="400" cy="250" r="154" />
        <circle cx="400" cy="250" r="132" />
        <circle cx="400" cy="250" r="110" />
        <circle cx="400" cy="250" r="88" />
        <circle cx="400" cy="250" r="66" />
        <circle cx="400" cy="250" r="44" />
        <circle cx="400" cy="250" r="22" />
        <line x1="392" y1="242" x2="408" y2="258" strokeWidth="2" />
        <line x1="408" y1="242" x2="392" y2="258" strokeWidth="2" />
      </g>
    </svg>
  );
}

function TennisBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="30" y1="80" x2="770" y2="80" />
        <line x1="30" y1="420" x2="770" y2="420" />
        <line x1="400" y1="30" x2="400" y2="470" strokeWidth="2.5" />
        <line x1="200" y1="80" x2="200" y2="420" />
        <line x1="600" y1="80" x2="600" y2="420" />
        <line x1="200" y1="250" x2="600" y2="250" />
        <line x1="395" y1="80" x2="405" y2="80" strokeWidth="3" />
        <line x1="395" y1="420" x2="405" y2="420" strokeWidth="3" />
      </g>
    </svg>
  );
}

function TableTennisBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <g opacity="0.55">
        {/* Table surface */}
        <rect x="0" y="0" width="800" height="500" fill="#1d4ea3" />
        {/* Mid-table seam (where the two halves of the folding table meet) */}
        <rect x="397" y="0" width="6" height="500" fill="#0d2553" />
        {/* Outer boundary */}
        <rect x="40" y="40" width="720" height="420" fill="none" stroke="white" strokeWidth="3" />
        {/* Lengthwise center stripe on each half */}
        <line x1="40" y1="250" x2="395" y2="250" stroke="white" strokeWidth="3" />
        <line x1="405" y1="250" x2="760" y2="250" stroke="white" strokeWidth="3" />

        {/* Red paddle — bottom-left, head up-right, handle down-left */}
        <g transform="rotate(30 200 350)">
          <rect x="190" y="400" width="20" height="78" rx="6" fill="#8b5a2b" />
          <rect x="194" y="395" width="12" height="10" rx="2" fill="#5c3a1a" />
          <ellipse cx="200" cy="350" rx="58" ry="52" fill="#c8302c" stroke="rgba(0,0,0,0.4)" strokeWidth="2" />
        </g>

        {/* Black paddle — top-right, head down-left, handle up-right */}
        <g transform="rotate(210 600 150)">
          <rect x="590" y="200" width="20" height="78" rx="6" fill="#a06b3a" />
          <rect x="594" y="195" width="12" height="10" rx="2" fill="#6b401a" />
          <ellipse cx="600" cy="150" rx="58" ry="52" fill="#1a1a1a" stroke="rgba(0,0,0,0.55)" strokeWidth="2" />
        </g>

        {/* White ball — between the paddles */}
        <circle cx="450" cy="225" r="11" fill="white" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      </g>
    </svg>
  );
}

const SPORT_BACKDROP: Record<string, () => React.ReactElement> = {
  BASKETBALL: BasketballBackdrop,
  FOOTBALL: FootballBackdrop,
  CRICKET: CricketBackdrop,
  FIELD_HOCKEY: FieldHockeyBackdrop,
  BADMINTON: BadmintonBackdrop,
  ATHLETICS: AthleticsBackdrop,
  WRESTLING: WrestlingBackdrop,
  BOXING: BoxingBackdrop,
  SHOOTING: ShootingBackdrop,
  WEIGHTLIFTING: WeightliftingBackdrop,
  ARCHERY: ArcheryBackdrop,
  TENNIS: TennisBackdrop,
  TABLE_TENNIS: TableTennisBackdrop,
};

export default function Home() {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [openPost, setOpenPost] = useState<any | null>(null);

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
    <div className="-mx-4 -my-4 md:-mx-6 md:-my-6">
      {Backdrop && (
        <div className="hidden md:block fixed top-0 bottom-0 right-0 pointer-events-none select-none z-[1]" style={{ left: '256px' }}>
          <Backdrop />
        </div>
      )}

      <div className="relative z-10">
        {previewSport && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-purple-500/10 border border-purple-400/30 rounded-xl px-4 py-3 text-sm">
            <span className="text-white/80">
              <span className="text-purple-300 font-semibold">Admin preview</span> — viewing the feed as a{' '}
              <span className="text-white font-medium">{previewLabel}</span> athlete.
            </span>
            <button
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('previewSport');
                setSearchParams(next, { replace: true });
              }}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs text-purple-200 hover:text-white border border-purple-400/30 hover:border-purple-300 rounded-lg transition-colors"
            >
              <X size={13} /> Exit preview
            </button>
          </div>
        )}

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

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, MapPin, Clock } from 'lucide-react';
import api from '../api/client';
import { useState, useRef, useEffect, useCallback } from 'react';
import React from 'react';

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
  // viewBox 0 0 940 520 — court from (20,20) to (920,500), 900×480 px
  // Scale: 900/94 ft ≈ 9.57 px/ft (x),  480/50 ft = 9.6 px/ft (y)
  // Left basket: (70,260)   Right basket: (870,260)
  // Key: 16 ft wide (154 px) × 19 ft deep (182 px)
  // FT circle: r = 6 ft = 57 px,  center at FT line (x=202 / x=738)
  // 3pt corner y: 260 ± 211 px (22 ft) → y=49 & y=471
  // 3pt arc start x: basket ± √(227²−211²) = ±84 px → x=154 / x=786  (r=227px = 23.75 ft)
  return (
    <svg
      viewBox="0 0 940 520"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <g stroke="white" fill="none" strokeWidth="1.8" opacity="0.18">
        {/* ── Court boundary ── */}
        <rect x="20" y="20" width="900" height="480" />

        {/* Half-court line */}
        <line x1="470" y1="20" x2="470" y2="500" />

        {/* Centre circle  r = 6 ft = 57 px */}
        <circle cx="470" cy="260" r="57" />

        {/* ══ LEFT SIDE ══ */}

        {/* Backboard at x=58 (4 ft from baseline), 6 ft wide */}
        <line x1="58" y1="231" x2="58" y2="289" strokeWidth="3.5" />
        {/* Rim  r ≈ 10 px */}
        <circle cx="70" cy="260" r="10" />

        {/* Key / paint  (x 20→202, y 183→337) */}
        <rect x="20" y="183" width="182" height="154" />

        {/* Lane hash marks — top edge (outward = upward) */}
        <line x1="63"  y1="183" x2="63"  y2="171" />
        <line x1="90"  y1="183" x2="90"  y2="171" />
        <line x1="130" y1="183" x2="130" y2="171" />
        <line x1="157" y1="183" x2="157" y2="171" />
        {/* Lane hash marks — bottom edge (outward = downward) */}
        <line x1="63"  y1="337" x2="63"  y2="349" />
        <line x1="90"  y1="337" x2="90"  y2="349" />
        <line x1="130" y1="337" x2="130" y2="349" />
        <line x1="157" y1="337" x2="157" y2="349" />

        {/* FT circle — outer half (solid, faces centre court) */}
        <path d="M202,203 A57,57 0 0 1 202,317" />
        {/* FT circle — inner half (dashed, faces basket) */}
        <path d="M202,203 A57,57 0 0 0 202,317" strokeDasharray="5 4" />

        {/* 3-pt corner straight segments */}
        <line x1="20"  y1="49"  x2="154" y2="49"  />
        <line x1="20"  y1="471" x2="154" y2="471" />
        {/* 3-pt arc  centre=(70,260) r=227 — small clockwise arc = D-shape facing right */}
        <path d="M154,49 A227,227 0 0 1 154,471" />

        {/* Restricted-area arc  r=38 (4 ft), dashed */}
        <path d="M70,222 A38,38 0 0 1 70,298" strokeDasharray="4 3" />

        {/* ══ RIGHT SIDE ══ */}

        {/* Backboard at x=882 */}
        <line x1="882" y1="231" x2="882" y2="289" strokeWidth="3.5" />
        {/* Rim */}
        <circle cx="870" cy="260" r="10" />

        {/* Key / paint  (x 738→920, y 183→337) */}
        <rect x="738" y="183" width="182" height="154" />

        {/* Lane hash marks — top edge */}
        <line x1="877" y1="183" x2="877" y2="171" />
        <line x1="850" y1="183" x2="850" y2="171" />
        <line x1="810" y1="183" x2="810" y2="171" />
        <line x1="783" y1="183" x2="783" y2="171" />
        {/* Lane hash marks — bottom edge */}
        <line x1="877" y1="337" x2="877" y2="349" />
        <line x1="850" y1="337" x2="850" y2="349" />
        <line x1="810" y1="337" x2="810" y2="349" />
        <line x1="783" y1="337" x2="783" y2="349" />

        {/* FT circle — outer half (solid) */}
        <path d="M738,203 A57,57 0 0 0 738,317" />
        {/* FT circle — inner half (dashed) */}
        <path d="M738,203 A57,57 0 0 1 738,317" strokeDasharray="5 4" />

        {/* 3-pt corner straight segments */}
        <line x1="786" y1="49"  x2="920" y2="49"  />
        <line x1="786" y1="471" x2="920" y2="471" />
        {/* 3-pt arc  centre=(870,260) r=227 — small counter-clockwise arc = D-shape facing left */}
        <path d="M786,49 A227,227 0 0 0 786,471" />

        {/* Restricted-area arc, dashed */}
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
        {/* Pitch boundary */}
        <rect x="30" y="30" width="740" height="440" />
        {/* Centre line */}
        <line x1="400" y1="30" x2="400" y2="470" />
        {/* Centre circle (r ≈ 65 px for 9.15 m) */}
        <circle cx="400" cy="250" r="65" />
        {/* Centre spot */}
        <circle cx="400" cy="250" r="4" fill="white" stroke="none" />

        {/* ── LEFT PENALTY AREA (116 × 260 px) ── */}
        <rect x="30" y="120" width="116" height="260" />
        {/* Left goal area (39 × 118 px) */}
        <rect x="30" y="191" width="39" height="118" />
        {/* Left goal (off pitch) */}
        <rect x="10" y="221" width="20" height="58" />
        {/* Left penalty spot */}
        <circle cx="108" cy="250" r="3" fill="white" stroke="none" />
        {/* Left penalty arc (only portion outside the box) */}
        <path d="M146,197 A65,65 0 0 1 146,303" />

        {/* ── RIGHT PENALTY AREA ── */}
        <rect x="654" y="120" width="116" height="260" />
        {/* Right goal area */}
        <rect x="731" y="191" width="39" height="118" />
        {/* Right goal */}
        <rect x="770" y="221" width="20" height="58" />
        {/* Right penalty spot */}
        <circle cx="692" cy="250" r="3" fill="white" stroke="none" />
        {/* Right penalty arc */}
        <path d="M654,197 A65,65 0 0 0 654,303" />

        {/* Corner arcs (quadratic bézier, r ≈ 18 px) */}
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
        {/* Outer boundary oval */}
        <ellipse cx="400" cy="250" rx="362" ry="228" />
        {/* 30-yard fielding restriction oval */}
        <ellipse cx="400" cy="250" rx="192" ry="170" />

        {/* Pitch rectangle — 22 yds ≈ 178 px long, 22 px wide */}
        <rect x="311" y="239" width="178" height="22" fill="white" fillOpacity="0.09" strokeWidth="1.2" />

        {/* ── LEFT END ── */}
        {/* Bowling crease — vertical line at the wicket (left edge of pitch) */}
        <line x1="311" y1="224" x2="311" y2="276" />
        {/* Popping crease — 4 ft inward, extends well beyond pitch edges */}
        <line x1="326" y1="207" x2="326" y2="293" />
        {/* Return creases — run OUTWARD (leftward) from the popping crease */}
        <line x1="296" y1="224" x2="326" y2="224" />
        <line x1="296" y1="276" x2="326" y2="276" />
        {/* Stumps — 3 dots (top-down view of cylindrical posts) */}
        <circle cx="315" cy="243" r="3" fill="white" stroke="none" />
        <circle cx="315" cy="250" r="3" fill="white" stroke="none" />
        <circle cx="315" cy="257" r="3" fill="white" stroke="none" />

        {/* ── RIGHT END ── */}
        {/* Bowling crease */}
        <line x1="489" y1="224" x2="489" y2="276" />
        {/* Popping crease */}
        <line x1="474" y1="207" x2="474" y2="293" />
        {/* Return creases — run OUTWARD (rightward) from the popping crease */}
        <line x1="474" y1="224" x2="504" y2="224" />
        <line x1="474" y1="276" x2="504" y2="276" />
        {/* Stumps */}
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
  const [page, setPage] = useState(1);
  const postRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);

  const applyDrum = useCallback(() => {
    const mid = window.innerHeight / 2;
    postRefs.current.forEach((el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const offset = (rect.top + rect.height / 2 - mid) / window.innerHeight;
      const clamped = Math.max(-0.75, Math.min(0.75, offset));
      const angle   = clamped * 38;
      const opacity = Math.max(0.28, 1 - Math.abs(clamped) * 0.88);
      const scale   = Math.max(0.86, 1 - Math.abs(clamped) * 0.16);
      el.style.transform  = `perspective(1100px) rotateX(${angle}deg) scale(${scale})`;
      el.style.opacity    = String(opacity);
      el.style.transition = 'transform 0.12s ease-out, opacity 0.12s ease-out';
    });
  }, []);

  // Enable scroll-snap on the page while Home is mounted
  useEffect(() => {
    const html = document.documentElement;
    html.style.scrollSnapType      = 'y mandatory';
    html.style.overscrollBehaviorY = 'contain';
    return () => {
      html.style.scrollSnapType      = '';
      html.style.overscrollBehaviorY = '';
    };
  }, []);

  // Run drum effect on scroll + whenever posts load/change
  useEffect(() => {
    const t = setTimeout(applyDrum, 50);
    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(applyDrum);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [applyDrum]);

  const { data, isLoading } = useQuery({
    queryKey: ['feed', page],
    queryFn: async () => {
      const { data } = await api.get(`/feed?page=${page}&limit=10`);
      return data;
    },
  });

  const Backdrop = SPORT_BACKDROP[user?.sport ?? ''];

  return (
    <div>
      {/* Full-screen sport backdrop — fixed so it fills the entire viewport */}
      {Backdrop && (
        <div className="hidden md:block fixed top-0 bottom-0 right-0 pointer-events-none select-none z-[1]" style={{ left: '256px' }}>
          <Backdrop />
        </div>
      )}

      {/* All page content sits above the backdrop */}
      <div className="relative z-10">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data?.highlights?.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-12 text-center shadow-xl">
            <p className="text-gray-custom text-lg">Your feed is empty</p>
            <p className="text-sm text-gray-custom mt-2">Follow athletes and coaches to see their highlights here</p>
            <Link
              to="/explore"
              className="inline-block mt-4 px-6 py-2 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors"
            >
              Explore Athletes
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {data?.highlights?.map((highlight: any, i: number) => (
              /* ── Drum scroll wrapper ── */
              <div
                key={highlight.id}
                ref={(el) => { postRefs.current[i] = el; }}
                style={{ scrollSnapAlign: 'start', willChange: 'transform, opacity' }}
              >
              {/* ── Glassmorphism card ── */}
              <div
                className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-xl"
              >
                {/* User header */}
                <div className="p-4 flex items-center gap-3">
                  <Link to={`/profile/${highlight.user?.id}`}>
                    {highlight.user?.avatar ? (
                      <img src={highlight.user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary-light">
                        {highlight.user?.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </Link>
                  <div className="flex-1">
                    <Link
                      to={`/profile/${highlight.user?.id}`}
                      className="font-medium hover:text-primary-light transition-colors"
                    >
                      {highlight.user?.name}
                    </Link>
                    <p className="text-xs text-gray-custom flex items-center gap-2">
                      <span className="capitalize">{highlight.user?.role?.toLowerCase()}</span>
                      <span>·</span>
                      <span className="capitalize">{highlight.sport?.toLowerCase()}</span>
                      {highlight.user?.position && (
                        <><span>·</span><span>{highlight.user.position}</span></>
                      )}
                    </p>
                  </div>
                  <span className="text-xs text-gray-custom flex items-center gap-1">
                    <Clock size={12} />
                    {timeAgo(highlight.createdAt)}
                  </span>
                </div>

                {/* Video */}
                <div className="relative bg-black aspect-video">
                  <video
                    src={highlight.videoUrl}
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain"
                    poster={highlight.thumbnailUrl}
                  />
                </div>

                {/* Details */}
                <div className="p-4">
                  <h3 className="font-semibold">{highlight.title}</h3>
                  {highlight.description && (
                    <p className="text-sm text-gray-custom mt-1">{highlight.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-custom">
                    <span className="flex items-center gap-1">
                      <Eye size={14} /> {highlight.views} views
                    </span>
                    {highlight.tournament && (
                      <span className="flex items-center gap-1">
                        <MapPin size={14} /> {highlight.tournament.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              </div>
            ))}

            {/* Pagination */}
            {data?.totalPages > 1 && (
              <div className="flex justify-center gap-2 py-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-gray-custom">
                  Page {page} of {data.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= data.totalPages}
                  className="px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

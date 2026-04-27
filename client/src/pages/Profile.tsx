import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { MapPin, Users, Trophy, Video, UserPlus, UserCheck, UserMinus, Edit, Calendar, Ruler, Trash2, Plus, X, Share2, MoreHorizontal, Flag, Ban, Send, Link2, Repeat2 } from 'lucide-react';
import ShareProfileModal from '../components/ShareProfileModal';
import toast from 'react-hot-toast';
import ImageCarousel from '../components/ImageCarousel';
import PostActions from '../components/PostActions';
import PostDetailModal from '../components/PostDetailModal';

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

const ROLE_COLORS: Record<string, string> = {
  ATHLETE: 'bg-primary/20 text-primary-light',
  COACH: 'bg-secondary/20 text-secondary',
  SCOUT: 'bg-accent/20 text-accent',
  AGENT: 'bg-amber-500/20 text-amber-400',
  ADMIN: 'bg-purple-500/20 text-purple-400',
};

const SPORT_ICONS: Record<string, string> = {
  BASKETBALL: '🏀',
  FOOTBALL: '⚽',
  CRICKET: '🏏',
};

function BasketballCourtBackdrop() {
  // viewBox 0 0 940 520 — court (20,20)→(920,500), 900×480 px
  // Scale ≈ 9.57 px/ft (x) and 9.6 px/ft (y) — nearly equal so circles stay circular
  // Left basket (70,260)  Right basket (870,260)
  // Key: 16 ft wide (154 px) × 19 ft deep (182 px)
  // FT circle r = 6 ft = 57 px, center at FT line x=202 / x=738
  // 3pt corner y: 260 ± 211 px (22 ft)  →  y=49 & y=471
  // 3pt arc start x: 70+√(227²−211²) = 154 / 920−154 = 786  (r=227 px = 23.75 ft)
  return (
    <svg
      viewBox="0 0 940 520"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Court floor */}
      <rect x="0" y="0" width="940" height="520" fill="rgba(170,100,30,0.55)" />
      {/* Paint fills */}
      <rect x="20" y="183" width="182" height="154" fill="rgba(210,80,20,0.3)" />
      <rect x="738" y="183" width="182" height="154" fill="rgba(210,80,20,0.3)" />

      <g stroke="white" fill="none" strokeWidth="1.8" opacity="0.85">
        {/* Court boundary */}
        <rect x="20" y="20" width="900" height="480" />
        {/* Half-court line */}
        <line x1="470" y1="20" x2="470" y2="500" />
        {/* Centre circle r=57 px (6 ft) */}
        <circle cx="470" cy="260" r="57" />

        {/* ── LEFT SIDE ── */}
        <line x1="58" y1="231" x2="58" y2="289" strokeWidth="3.5" />
        <circle cx="70" cy="260" r="10" stroke="rgba(255,165,40,0.95)" strokeWidth="2.5" />
        <rect x="20" y="183" width="182" height="154" />
        <line x1="63"  y1="183" x2="63"  y2="171" /><line x1="90"  y1="183" x2="90"  y2="171" />
        <line x1="130" y1="183" x2="130" y2="171" /><line x1="157" y1="183" x2="157" y2="171" />
        <line x1="63"  y1="337" x2="63"  y2="349" /><line x1="90"  y1="337" x2="90"  y2="349" />
        <line x1="130" y1="337" x2="130" y2="349" /><line x1="157" y1="337" x2="157" y2="349" />
        {/* FT circle outer (solid, faces centre) */}
        <path d="M202,203 A57,57 0 0 1 202,317" />
        {/* FT circle inner (dashed, faces basket) */}
        <path d="M202,203 A57,57 0 0 0 202,317" strokeDasharray="5 4" />
        {/* 3pt corner straights */}
        <line x1="20"  y1="49"  x2="154" y2="49"  />
        <line x1="20"  y1="471" x2="154" y2="471" />
        {/* 3pt arc — D-shape facing right */}
        <path d="M154,49 A227,227 0 0 1 154,471" />
        {/* Restricted-area arc */}
        <path d="M70,222 A38,38 0 0 1 70,298" strokeDasharray="4 3" />

        {/* ── RIGHT SIDE ── */}
        <line x1="882" y1="231" x2="882" y2="289" strokeWidth="3.5" />
        <circle cx="870" cy="260" r="10" stroke="rgba(255,165,40,0.95)" strokeWidth="2.5" />
        <rect x="738" y="183" width="182" height="154" />
        <line x1="877" y1="183" x2="877" y2="171" /><line x1="850" y1="183" x2="850" y2="171" />
        <line x1="810" y1="183" x2="810" y2="171" /><line x1="783" y1="183" x2="783" y2="171" />
        <line x1="877" y1="337" x2="877" y2="349" /><line x1="850" y1="337" x2="850" y2="349" />
        <line x1="810" y1="337" x2="810" y2="349" /><line x1="783" y1="337" x2="783" y2="349" />
        {/* FT circle outer (solid) */}
        <path d="M738,203 A57,57 0 0 0 738,317" />
        {/* FT circle inner (dashed) */}
        <path d="M738,203 A57,57 0 0 1 738,317" strokeDasharray="5 4" />
        {/* 3pt corner straights */}
        <line x1="786" y1="49"  x2="920" y2="49"  />
        <line x1="786" y1="471" x2="920" y2="471" />
        {/* 3pt arc — D-shape facing left */}
        <path d="M786,49 A227,227 0 0 0 786,471" />
        {/* Restricted-area arc */}
        <path d="M870,222 A38,38 0 0 0 870,298" strokeDasharray="4 3" />
      </g>
    </svg>
  );
}

function FootballPitchBackdrop() {
  return (
    <svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      {/* Grass base */}
      <rect x="0" y="0" width="800" height="300" fill="rgba(38,115,52,0.5)" />
      {/* Mowing stripes */}
      {Array.from({ length: 10 }).map((_, i) =>
        i % 2 === 0 ? (
          <rect key={i} x="20" y={15 + i * 27} width="760" height="27" fill="rgba(255,255,255,0.05)" />
        ) : null
      )}
      {/* Pitch boundary */}
      <rect x="20" y="15" width="760" height="270" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" />
      {/* Halfway line */}
      <line x1="400" y1="15" x2="400" y2="285" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
      {/* Center circle */}
      <circle cx="400" cy="150" r="50" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
      {/* Center spot */}
      <circle cx="400" cy="150" r="3" fill="rgba(255,255,255,0.9)" />

      {/* === LEFT SIDE === */}
      {/* Left penalty area */}
      <rect x="20" y="70" width="120" height="160" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
      {/* Left goal area */}
      <rect x="20" y="114" width="40" height="72" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
      {/* Left penalty spot */}
      <circle cx="100" cy="150" r="3" fill="rgba(255,255,255,0.9)" />
      {/* Left penalty arc — only outside the box */}
      <path d="M 140,98 A 66,66 0 0 1 140,202" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
      {/* Left goal */}
      <rect x="5" y="136" width="15" height="28" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" />

      {/* === RIGHT SIDE === */}
      {/* Right penalty area */}
      <rect x="660" y="70" width="120" height="160" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
      {/* Right goal area */}
      <rect x="740" y="114" width="40" height="72" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
      {/* Right penalty spot */}
      <circle cx="700" cy="150" r="3" fill="rgba(255,255,255,0.9)" />
      {/* Right penalty arc — only outside the box */}
      <path d="M 660,98 A 66,66 0 0 0 660,202" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
      {/* Right goal */}
      <rect x="780" y="136" width="15" height="28" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" />
    </svg>
  );
}

function CricketPitchBackdrop() {
  const pitchPoints = '160,290 640,290 465,10 335,10';
  return (
    <svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <clipPath id="cricket-pitch-clip">
          <polygon points={pitchPoints} />
        </clipPath>
      </defs>
      {/* Pitch base */}
      <polygon points={pitchPoints} fill="rgba(60,120,75,0.55)" />
      {/* Mowing stripes */}
      {Array.from({ length: 14 }).map((_, i) =>
        i % 2 === 0 ? (
          <rect
            key={i}
            x="0"
            y={10 + i * (280 / 14)}
            width="800"
            height={280 / 14}
            fill="rgba(255,255,255,0.07)"
            clipPath="url(#cricket-pitch-clip)"
          />
        ) : null
      )}
      {/* Front crease */}
      <line x1="145" y1="252" x2="655" y2="252" stroke="white" strokeWidth="3" clipPath="url(#cricket-pitch-clip)" />
      {/* Back crease */}
      <line x1="318" y1="48" x2="482" y2="48" stroke="white" strokeWidth="2" clipPath="url(#cricket-pitch-clip)" />
      {/* Front stumps */}
      <g fill="rgba(245,245,245,0.95)">
        <rect x="385" y="215" width="6" height="43" rx="2" />
        <rect x="400" y="215" width="6" height="43" rx="2" />
        <rect x="415" y="215" width="6" height="43" rx="2" />
        <rect x="385" y="212" width="15" height="3" rx="1.5" />
        <rect x="400" y="212" width="16" height="3" rx="1.5" />
      </g>
      {/* Back stumps */}
      <g fill="rgba(245,245,245,0.9)">
        <rect x="394" y="13" width="3.5" height="32" rx="1" />
        <rect x="401" y="13" width="3.5" height="32" rx="1" />
        <rect x="408" y="13" width="3.5" height="32" rx="1" />
        <rect x="394" y="12" width="9" height="2" rx="1" />
        <rect x="403" y="12" width="9" height="2" rx="1" />
      </g>
    </svg>
  );
}

function FieldHockeyPitchBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="800" height="500" fill="rgba(30,90,160,0.55)" />
      <g stroke="rgba(255,255,255,0.85)" fill="none" strokeWidth="2.2">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="400" y1="30" x2="400" y2="470" />
        <line x1="190" y1="30" x2="190" y2="470" strokeDasharray="6 4" strokeWidth="1.6" />
        <line x1="610" y1="30" x2="610" y2="470" strokeDasharray="6 4" strokeWidth="1.6" />
        <path d="M30,160 A140,140 0 0 1 30,340" />
        <path d="M770,160 A140,140 0 0 0 770,340" />
        <rect x="15" y="225" width="15" height="50" fill="rgba(255,255,255,0.15)" />
        <rect x="770" y="225" width="15" height="50" fill="rgba(255,255,255,0.15)" />
        <circle cx="120" cy="250" r="3.5" fill="rgba(255,255,255,0.95)" stroke="none" />
        <circle cx="680" cy="250" r="3.5" fill="rgba(255,255,255,0.95)" stroke="none" />
      </g>
    </svg>
  );
}

function BadmintonCourtBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="800" height="500" fill="rgba(30,90,55,0.55)" />
      <g stroke="rgba(255,255,255,0.9)" fill="none" strokeWidth="2.2">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="400" y1="30" x2="400" y2="470" strokeWidth="3" />
        <line x1="30" y1="60" x2="770" y2="60" />
        <line x1="30" y1="440" x2="770" y2="440" />
        <line x1="290" y1="30" x2="290" y2="470" />
        <line x1="510" y1="30" x2="510" y2="470" />
        <line x1="80" y1="30" x2="80" y2="470" />
        <line x1="720" y1="30" x2="720" y2="470" />
        <line x1="80" y1="250" x2="290" y2="250" />
        <line x1="510" y1="250" x2="720" y2="250" />
        <rect x="395" y="180" width="10" height="140" fill="rgba(255,255,255,0.18)" stroke="none" />
      </g>
    </svg>
  );
}

function AthleticsTrackBackdrop() {
  return (
    <svg viewBox="0 0 940 520" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="940" height="520" fill="rgba(180,55,40,0.55)" />
      <ellipse cx="470" cy="260" rx="380" ry="170" fill="rgba(50,120,60,0.55)" stroke="none" />
      <g stroke="rgba(255,255,255,0.9)" fill="none" strokeWidth="2.2">
        <ellipse cx="470" cy="260" rx="430" ry="220" />
        <ellipse cx="470" cy="260" rx="380" ry="170" />
        <ellipse cx="470" cy="260" rx="420" ry="210" strokeDasharray="8 6" strokeWidth="1.4" />
        <ellipse cx="470" cy="260" rx="410" ry="200" strokeDasharray="8 6" strokeWidth="1.4" />
        <ellipse cx="470" cy="260" rx="400" ry="190" strokeDasharray="8 6" strokeWidth="1.4" />
        <ellipse cx="470" cy="260" rx="390" ry="180" strokeDasharray="8 6" strokeWidth="1.4" />
        <line x1="470" y1="40" x2="470" y2="90" strokeWidth="3.5" />
      </g>
    </svg>
  );
}

function WrestlingMatBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="800" height="500" fill="rgba(220,140,40,0.5)" />
      <circle cx="400" cy="250" r="195" fill="rgba(190,90,40,0.45)" stroke="none" />
      <circle cx="400" cy="250" r="170" fill="rgba(50,90,150,0.4)" stroke="none" />
      <g stroke="rgba(255,255,255,0.9)" fill="none" strokeWidth="2.2">
        <rect x="50" y="50" width="700" height="400" />
        <circle cx="400" cy="250" r="195" />
        <circle cx="400" cy="250" r="170" />
        <circle cx="400" cy="250" r="140" strokeDasharray="6 5" strokeWidth="1.6" />
        <circle cx="400" cy="250" r="35" strokeWidth="2.5" />
        <circle cx="400" cy="250" r="4" fill="rgba(255,255,255,0.95)" stroke="none" />
      </g>
    </svg>
  );
}

function BoxingRingBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="800" height="500" fill="rgba(30,40,80,0.55)" />
      <rect x="80" y="80" width="640" height="340" fill="rgba(180,50,60,0.4)" stroke="none" />
      <g stroke="rgba(255,255,255,0.9)" fill="none" strokeWidth="2.2">
        <rect x="50" y="50" width="700" height="400" />
        <rect x="80" y="80" width="640" height="340" />
        <rect x="100" y="100" width="600" height="300" strokeWidth="1.6" />
        <rect x="120" y="120" width="560" height="260" strokeWidth="1.6" />
        <circle cx="80" cy="80" r="7" fill="rgba(255,255,255,0.85)" stroke="none" />
        <circle cx="720" cy="80" r="7" fill="rgba(255,255,255,0.85)" stroke="none" />
        <circle cx="80" cy="420" r="7" fill="rgba(255,255,255,0.85)" stroke="none" />
        <circle cx="720" cy="420" r="7" fill="rgba(255,255,255,0.85)" stroke="none" />
        <circle cx="400" cy="250" r="5" fill="rgba(255,255,255,0.9)" stroke="none" />
      </g>
    </svg>
  );
}

function ShootingTargetBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="800" height="500" fill="rgba(120,115,100,0.55)" />
      <rect x="170" y="20" width="460" height="460" fill="rgba(245,240,225,0.55)" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" />
      <circle cx="400" cy="250" r="120" fill="rgba(20,20,20,0.7)" stroke="none" />
      <g stroke="rgba(255,255,255,0.9)" fill="none" strokeWidth="2">
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
      </g>
      <circle cx="400" cy="250" r="4" fill="rgba(255,255,255,0.95)" stroke="none" />
    </svg>
  );
}

function WeightliftingBarbellBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="800" height="500" fill="rgba(80,55,30,0.55)" />
      <rect x="60" y="380" width="680" height="40" fill="rgba(140,90,40,0.55)" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <g stroke="rgba(255,255,255,0.9)" fill="none" strokeWidth="2.2">
        <line x1="120" y1="240" x2="680" y2="240" strokeWidth="5" stroke="rgba(220,220,220,0.95)" />
        <line x1="120" y1="232" x2="200" y2="232" strokeWidth="7" stroke="rgba(200,200,200,0.95)" />
        <line x1="600" y1="232" x2="680" y2="232" strokeWidth="7" stroke="rgba(200,200,200,0.95)" />
      </g>
      <g>
        <circle cx="170" cy="240" r="100" fill="rgba(20,20,20,0.7)" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" />
        <circle cx="170" cy="240" r="80" fill="rgba(200,40,40,0.55)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <circle cx="170" cy="240" r="60" fill="rgba(40,80,180,0.55)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <circle cx="170" cy="240" r="38" fill="rgba(220,180,40,0.6)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <circle cx="170" cy="240" r="18" fill="rgba(40,160,80,0.6)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <circle cx="630" cy="240" r="100" fill="rgba(20,20,20,0.7)" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" />
        <circle cx="630" cy="240" r="80" fill="rgba(200,40,40,0.55)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <circle cx="630" cy="240" r="60" fill="rgba(40,80,180,0.55)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <circle cx="630" cy="240" r="38" fill="rgba(220,180,40,0.6)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <circle cx="630" cy="240" r="18" fill="rgba(40,160,80,0.6)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <line x1="200" y1="218" x2="200" y2="262" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
        <line x1="600" y1="218" x2="600" y2="262" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
      </g>
    </svg>
  );
}

function ArcheryTargetBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="800" height="500" fill="rgba(125,140,80,0.5)" />
      <g stroke="rgba(255,255,255,0.85)" strokeWidth="1.6">
        <circle cx="400" cy="250" r="220" fill="rgba(245,245,245,0.85)" />
        <circle cx="400" cy="250" r="176" fill="rgba(20,20,20,0.7)" />
        <circle cx="400" cy="250" r="132" fill="rgba(40,90,180,0.7)" />
        <circle cx="400" cy="250" r="88" fill="rgba(220,40,40,0.75)" />
        <circle cx="400" cy="250" r="44" fill="rgba(230,200,40,0.85)" />
        <circle cx="400" cy="250" r="22" fill="none" />
        <line x1="392" y1="242" x2="408" y2="258" strokeWidth="2.5" />
        <line x1="408" y1="242" x2="392" y2="258" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

function TennisCourtBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="800" height="500" fill="rgba(40,90,160,0.55)" />
      <rect x="200" y="80" width="400" height="340" fill="rgba(60,130,80,0.5)" stroke="none" />
      <g stroke="rgba(255,255,255,0.9)" fill="none" strokeWidth="2.2">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="30" y1="80" x2="770" y2="80" />
        <line x1="30" y1="420" x2="770" y2="420" />
        <line x1="400" y1="30" x2="400" y2="470" strokeWidth="3" />
        <line x1="200" y1="80" x2="200" y2="420" />
        <line x1="600" y1="80" x2="600" y2="420" />
        <line x1="200" y1="250" x2="600" y2="250" />
        <line x1="395" y1="80" x2="405" y2="80" strokeWidth="3.5" />
        <line x1="395" y1="420" x2="405" y2="420" strokeWidth="3.5" />
      </g>
    </svg>
  );
}

function TableTennisTableBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="800" height="500" fill="rgba(20,40,80,0.55)" />
      <rect x="60" y="120" width="680" height="260" fill="rgba(30,90,160,0.65)" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" />
      <rect x="395" y="100" width="10" height="300" fill="rgba(20,30,60,0.85)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      <line x1="395" y1="100" x2="405" y2="100" stroke="rgba(255,255,255,0.9)" strokeWidth="3" />
      <line x1="395" y1="400" x2="405" y2="400" stroke="rgba(255,255,255,0.9)" strokeWidth="3" />
      <line x1="60" y1="250" x2="740" y2="250" stroke="rgba(255,255,255,0.85)" strokeDasharray="6 4" strokeWidth="1.6" />
      <circle cx="640" cy="210" r="10" fill="rgba(245,165,40,0.9)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
    </svg>
  );
}

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isOwnProfile = me?.id === id;
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null);
  const [openPost, setOpenPost] = useState<any | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['profile', id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const { data: mutualData } = useQuery<{
    users: any[];
    count: number;
    connections?: { users: any[]; count: number };
    followers?: { users: any[]; count: number };
  }>({
    queryKey: ['mutual-connections', id],
    queryFn: async () => {
      const { data } = await api.get(`/connections/mutual/${id}`);
      return data;
    },
    enabled: !!id && !isOwnProfile,
  });

  const { data: followListData, isLoading: followListLoading } = useQuery<{ users: any[] }>({
    queryKey: ['follow-list', id, followModal],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}/${followModal}`);
      return data;
    },
    enabled: !!id && !!followModal,
  });

  const isFollowing = data?.isFollowing ?? false;
  const connection = data?.connection;

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        await api.delete(`/connections/unfollow/${id}`);
      } else {
        await api.post(`/connections/follow/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', id] });
      toast.success(isFollowing ? 'Unfollowed' : 'Following!');
    },
    onError: () => toast.error('Action failed'),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.post(`/connections/request/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', id] });
      toast.success('Connection request sent!');
    },
    onError: () => toast.error('Could not send request'),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareDmOpen, setShareDmOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', description: '' });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: postsData } = useQuery({
    queryKey: ['user-posts', id],
    queryFn: async () => {
      const { data } = await api.get(`/posts/user/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const { data: repostsData } = useQuery({
    queryKey: ['user-reposts', id],
    queryFn: async () => {
      const { data } = await api.get(`/posts/user/${id}/reposts`);
      return data;
    },
    enabled: !!id,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!videoFile) throw new Error('No video selected');
      const formData = new FormData();
      formData.append('media', videoFile);
      formData.append('type', 'HIGHLIGHT');
      formData.append('title', uploadForm.title);
      if (uploadForm.description) formData.append('content', uploadForm.description);
      const { data } = await api.post('/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e: any) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-posts', id] });
      queryClient.invalidateQueries({ queryKey: ['profile', id] });
      toast.success('Highlight uploaded!');
      setShowUpload(false);
      setVideoFile(null);
      setUploadForm({ title: '', description: '' });
      setUploadProgress(0);
    },
    onError: () => toast.error('Upload failed'),
  });

  const deleteHighlightMutation = useMutation({
    mutationFn: (hid: string) => api.delete(`/highlights/${hid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', id] });
      toast.success('Deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const deletePostMutation = useMutation({
    mutationFn: (pid: string) => api.delete(`/posts/${pid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-posts', id] });
      toast.success('Deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="text-center py-20 text-gray-custom">
        <p>User not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-primary-light hover:underline text-sm">Go back</button>
      </div>
    );
  }

  const profile = data.user;
  const highlights = profile.highlights ?? [];
  const teams = (profile.teamMemberships ?? []).map((m: any) => m.team);
  const rankings = profile.playerRankings ?? [];
  const posts = postsData?.posts ?? [];
  const reposts = repostsData?.posts ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Card */}
      <div className="bg-dark-light rounded-xl border border-dark-lighter p-6 relative overflow-hidden">
        {profile.banner ? (
          <div className="absolute inset-0 pointer-events-none">
            <img src={profile.banner} alt="" className="w-full h-full object-cover opacity-40" />
          </div>
        ) : (() => {
          const Backdrop = profile.role !== 'ADMIN'
            ? {
                CRICKET: CricketPitchBackdrop,
                BASKETBALL: BasketballCourtBackdrop,
                FOOTBALL: FootballPitchBackdrop,
                FIELD_HOCKEY: FieldHockeyPitchBackdrop,
                BADMINTON: BadmintonCourtBackdrop,
                ATHLETICS: AthleticsTrackBackdrop,
                WRESTLING: WrestlingMatBackdrop,
                BOXING: BoxingRingBackdrop,
                SHOOTING: ShootingTargetBackdrop,
                WEIGHTLIFTING: WeightliftingBarbellBackdrop,
                ARCHERY: ArcheryTargetBackdrop,
                TENNIS: TennisCourtBackdrop,
                TABLE_TENNIS: TableTennisTableBackdrop,
              }[profile.sport as string]
            : undefined;
          return Backdrop ? <div className="absolute inset-0 pointer-events-none opacity-[0.10] md:opacity-[0.22]"><Backdrop /></div> : null;
        })()}
        {isOwnProfile && (
          <>
            <input
              type="file"
              accept="image/*"
              ref={bannerRef}
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('banner', file);
                try {
                  const { data: resp } = await api.put('/users/profile/banner', fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
                  queryClient.setQueryData(['profile', id], (old: any) =>
                    old ? { ...old, user: { ...old.user, banner: resp.banner } } : old,
                  );
                  toast.success('Banner updated');
                } catch {
                  toast.error('Failed to upload banner');
                }
              }}
            />
            <button
              onClick={() => bannerRef.current?.click()}
              className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 hover:bg-black/80 border border-white/10 text-white text-xs rounded-lg transition-colors"
            >
              <Edit size={12} />
              Edit banner
            </button>
          </>
        )}
        <div className="flex flex-col sm:flex-row gap-6 items-start relative z-10">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-dark-lighter flex items-center justify-center text-3xl font-bold shrink-0 overflow-hidden border-2 border-dark-lighter">
            {profile.avatar ? (
              <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              profile.name?.charAt(0).toUpperCase()
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold">{profile.name}</h1>
                  {profile.verified && me?.role === 'ADMIN' && (
                    <span className="text-accent text-xs bg-accent/10 px-2 py-0.5 rounded-full">Verified</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[profile.role] || 'bg-dark-lighter text-gray-custom'}`}>
                    {profile.role}
                  </span>
                  {profile.role !== 'ADMIN' && (
                    <span className="text-white/80 text-sm">
                      {SPORT_ICONS[profile.sport]} {profile.sport}
                    </span>
                  )}
                  {profile.position && profile.role !== 'ADMIN' && (
                    <span className="text-white/70 text-sm">· {profile.position}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <div className="relative">
                  <button
                    onClick={() => setShareMenuOpen((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2 bg-dark-lighter hover:bg-dark text-white text-sm font-medium rounded-lg transition-colors border border-dark-lighter"
                    title="Share profile"
                  >
                    <Share2 size={14} />
                    Share
                  </button>
                  {shareMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShareMenuOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-dark-light border border-dark-lighter rounded-lg shadow-xl overflow-hidden py-1">
                        {!isOwnProfile && (
                          <button
                            onClick={() => { setShareMenuOpen(false); setShareDmOpen(true); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-dark transition-colors text-left"
                          >
                            <Send size={14} /> Send in a chat
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            setShareMenuOpen(false);
                            const url = `${window.location.origin}/profile/${profile.id}`;
                            try {
                              await navigator.clipboard.writeText(url);
                              toast.success('Profile link copied');
                            } catch {
                              toast.error('Could not copy link');
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-dark transition-colors text-left"
                        >
                          <Link2 size={14} /> Copy link
                        </button>
                        {typeof navigator !== 'undefined' && 'share' in navigator && (
                          <button
                            onClick={async () => {
                              setShareMenuOpen(false);
                              const url = `${window.location.origin}/profile/${profile.id}`;
                              try { await navigator.share({ title: profile.name, url }); } catch { /* cancelled */ }
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-dark transition-colors text-left"
                          >
                            <Share2 size={14} /> Share to…
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {isOwnProfile ? (
                  <Link
                    to="/profile/edit"
                    className="flex items-center gap-2 px-4 py-2 bg-dark-lighter hover:bg-dark text-white text-sm font-medium rounded-lg transition-colors border border-dark-lighter"
                  >
                    <Edit size={14} />
                    Edit Profile
                  </Link>
                ) : (
                  <>
                    <div className="relative">
                      <button
                        onClick={() => setShowMoreMenu((v) => !v)}
                        className="flex items-center justify-center w-9 h-9 bg-dark-lighter hover:bg-dark border border-dark-lighter rounded-lg transition-colors"
                        aria-label="More options"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {showMoreMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                          <div className="absolute right-0 top-10 z-50 w-44 bg-dark-light border border-dark-lighter rounded-lg shadow-xl overflow-hidden">
                            <button
                              onClick={() => { setShowMoreMenu(false); setReportModal(true); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-dark transition-colors text-left"
                            >
                              <Flag size={14} className="text-yellow-400" /> Report user
                            </button>
                            <button
                              onClick={async () => {
                                setShowMoreMenu(false);
                                const isBlocked = data?.isBlocked;
                                try {
                                  if (isBlocked) {
                                    await api.delete(`/users/block/${id}`);
                                    toast.success('User unblocked');
                                  } else {
                                    if (!confirm('Block this user? They will no longer see your profile or messages.')) return;
                                    await api.post(`/users/block/${id}`);
                                    toast.success('User blocked');
                                  }
                                  queryClient.invalidateQueries({ queryKey: ['profile', id] });
                                } catch {
                                  toast.error('Action failed');
                                }
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-dark transition-colors text-left"
                            >
                              <Ban size={14} /> {data?.isBlocked ? 'Unblock user' : 'Block user'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => followMutation.mutate()}
                      disabled={followMutation.isPending}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isFollowing
                          ? 'bg-dark-lighter hover:bg-dark border border-dark-lighter text-white'
                          : 'bg-primary hover:bg-primary-dark text-dark font-semibold'
                      }`}
                    >
                      {isFollowing ? <UserMinus size={14} /> : <UserPlus size={14} />}
                      {isFollowing ? 'Unfollow' : 'Follow'}
                    </button>
                    {connection?.status === 'ACCEPTED' ? null : connection?.status === 'PENDING' ? (
                      <span className="flex items-center gap-2 px-4 py-2 text-sm text-white/60 border border-white/20 rounded-lg">
                        <UserCheck size={14} />
                        Pending
                      </span>
                    ) : (
                      <button
                        onClick={() => connectMutation.mutate()}
                        disabled={connectMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 bg-dark-lighter hover:bg-dark border border-dark-lighter text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <UserCheck size={14} />
                        Connect
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-white/70">
              {profile.location && (
                <span className="flex items-center gap-1"><MapPin size={13} />{profile.location}</span>
              )}
              {profile.age && (
                <span className="flex items-center gap-1"><Calendar size={13} />{profile.age} yrs</span>
              )}
              {profile.height && (
                <span className="flex items-center gap-1"><Ruler size={13} />{profile.height}</span>
              )}
            </div>

            {/* Stats Row */}
            <div className="flex gap-6 mt-4 text-sm">
              <button onClick={() => setFollowModal('followers')} className="hover:text-primary-light transition-colors text-left">
                <span className="font-bold text-white">{profile._count?.followers ?? 0}</span>
                <span className="text-white/70 ml-1">Followers</span>
              </button>
              <button onClick={() => setFollowModal('following')} className="hover:text-primary-light transition-colors text-left">
                <span className="font-bold text-white">{profile._count?.following ?? 0}</span>
                <span className="text-white/70 ml-1">Following</span>
              </button>
              <div>
                <span className="font-bold text-white">{highlights.length}</span>
                <span className="text-white/70 ml-1">Highlights</span>
              </div>
            </div>

            {!isOwnProfile && (mutualData?.count ?? 0) > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-white/70">
                <div className="flex -space-x-2">
                  {mutualData!.users.slice(0, 3).map((u) => (
                    <Link key={u.id} to={`/profile/${u.id}`} title={u.name}>
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover border-2 border-dark-light" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-primary/20 border-2 border-dark-light flex items-center justify-center text-[10px] font-bold text-primary-light">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
                <span>
                  {mutualData!.count} mutual connection{mutualData!.count === 1 ? '' : 's'}
                  {mutualData!.users.length > 0 && (
                    <> · {mutualData!.users.slice(0, 2).map((u) => u.name).join(', ')}{mutualData!.count > 2 ? ` and ${mutualData!.count - 2} more` : ''}</>
                  )}
                </span>
              </div>
            )}

            {!isOwnProfile && (mutualData?.followers?.count ?? 0) > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-white/70">
                <div className="flex -space-x-2">
                  {mutualData!.followers!.users.slice(0, 3).map((u) => (
                    <Link key={u.id} to={`/profile/${u.id}`} title={u.name}>
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover border-2 border-dark-light" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-secondary/20 border-2 border-dark-light flex items-center justify-center text-[10px] font-bold text-white/80">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
                <span>
                  {mutualData!.followers!.count} mutual follower{mutualData!.followers!.count === 1 ? '' : 's'}
                  {' · '}{mutualData!.followers!.users.slice(0, 2).map((u) => u.name).join(', ')}
                  {mutualData!.followers!.count > 2 ? ` and ${mutualData!.followers!.count - 2} more` : ''}
                </span>
              </div>
            )}

            {profile.bio && (
              <p className="mt-4 text-sm text-white/75 leading-relaxed">{profile.bio}</p>
            )}

            {(profile.contactEmail || (profile.phone && isOwnProfile)) && (
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                {profile.contactEmail && (
                  <a href={`mailto:${profile.contactEmail}`} className="flex items-center gap-1.5 px-2.5 py-1 bg-dark-lighter rounded-full text-white/80 hover:text-white transition-colors">
                    ✉️ {profile.contactEmail}
                  </a>
                )}
                {profile.phone && isOwnProfile && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-dark-lighter rounded-full text-white/80">
                    📞 {profile.phone} <span className="text-white/40">(private)</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Posts & Highlights */}
        <div className="lg:col-span-2 space-y-4">
          {/* Highlights */}
          <div className="bg-dark-light rounded-xl border border-dark-lighter p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Video size={16} className="text-primary-light" />
                Highlights
              </h2>
              {isOwnProfile && (
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-1 text-xs text-primary-light hover:text-primary transition-colors"
                >
                  <Plus size={14} />
                  Upload
                </button>
              )}
            </div>

            {/* Inline upload form */}
            {isOwnProfile && showUpload && (
              <div className="mb-4 p-4 bg-dark rounded-lg border border-dark-lighter space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Upload Highlight</p>
                  <button onClick={() => { setShowUpload(false); setVideoFile(null); setUploadProgress(0); }} className="text-gray-custom hover:text-white">
                    <X size={16} />
                  </button>
                </div>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-dark-lighter rounded-lg p-5 text-center cursor-pointer hover:border-primary transition-colors"
                >
                  {videoFile ? (
                    <p className="text-sm text-white">{videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)</p>
                  ) : (
                    <p className="text-sm text-gray-custom">Click to select video</p>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
                <input
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Title *"
                  className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
                />
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary resize-none"
                />
                {uploadMutation.isPending && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-custom mb-1">
                      <span>Uploading…</span><span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-dark-lighter rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}
                <button
                  onClick={() => uploadMutation.mutate()}
                  disabled={!videoFile || !uploadForm.title || uploadMutation.isPending}
                  className="w-full py-2 bg-primary hover:bg-primary-dark disabled:opacity-50 text-dark font-semibold text-sm rounded-lg transition-colors"
                >
                  {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            )}

            {highlights.length === 0 ? (
              <p className="text-gray-custom text-sm text-center py-6">No highlights yet</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {highlights.slice(0, 4).map((h: any) => (
                  <div key={h.id} className="rounded-lg overflow-hidden bg-dark border border-dark-lighter relative group">
                    <video src={h.videoUrl} className="w-full aspect-video object-cover" controls preload="metadata" />
                    <div className="p-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{h.title}</p>
                        <p className="text-xs text-gray-custom">{timeAgo(h.createdAt)}</p>
                      </div>
                      {isOwnProfile && (
                        <button
                          onClick={() => { if (confirm('Delete this highlight?')) deleteHighlightMutation.mutate(h.id); }}
                          className="text-gray-custom hover:text-red-400 transition-colors shrink-0 mt-0.5"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Text & Image Posts */}
          {posts.length > 0 && (
            <div className="bg-dark-light rounded-xl border border-dark-lighter p-5">
              <h2 className="font-semibold flex items-center gap-2 mb-4">
                <Video size={16} className="text-accent" />
                Posts
              </h2>
              <div className="space-y-3">
                {posts.map((p: any) => {
                  const postWithUser = { ...p, user: profile };
                  return (
                    <div key={p.id} className="bg-dark rounded-lg border border-dark-lighter overflow-hidden">
                      {p.type === 'IMAGE' && (
                        <div onClick={() => setOpenPost(postWithUser)} className="cursor-pointer">
                          {p.media?.length > 0 ? (
                            <ImageCarousel urls={p.media.map((m: any) => m.url)} alt={p.title || ''} />
                          ) : p.mediaUrl ? (
                            <img src={p.mediaUrl} alt={p.title || ''} className="w-full max-h-[32rem] object-contain bg-black" />
                          ) : null}
                        </div>
                      )}
                      {p.mediaUrl && p.type === 'HIGHLIGHT' && (
                        <video src={p.mediaUrl} className="w-full aspect-video object-cover" controls preload="metadata" />
                      )}
                      <div className="p-3 flex items-start justify-between gap-2">
                        <div
                          onClick={() => setOpenPost(postWithUser)}
                          className="min-w-0 cursor-pointer"
                        >
                          {p.title && <p className="text-sm font-medium mb-1">{p.title}</p>}
                          {p.content && <p className="text-sm text-gray-custom leading-relaxed">{p.content}</p>}
                          <p className="text-xs text-gray-custom mt-1">{timeAgo(p.createdAt)}</p>
                        </div>
                        {isOwnProfile && (
                          <button
                            onClick={() => { if (confirm('Delete this post?')) deletePostMutation.mutate(p.id); }}
                            className="text-gray-custom hover:text-red-400 transition-colors shrink-0 mt-0.5"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <PostActions
                        post={postWithUser}
                        invalidateKeys={[['user-posts', id as string]]}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reposts */}
          {reposts.length > 0 && (
            <div className="bg-dark-light rounded-xl border border-dark-lighter p-5">
              <h2 className="font-semibold flex items-center gap-2 mb-4">
                <Repeat2 size={16} className="text-green-400" />
                Reposts
              </h2>
              <div className="space-y-3">
                {reposts.map((p: any) => (
                  <div key={p.id} className="bg-dark rounded-lg border border-dark-lighter overflow-hidden">
                    <div className="flex items-center gap-2 px-3 pt-2.5 text-xs text-green-400">
                      <Repeat2 size={12} />
                      <span>{isOwnProfile ? 'You' : profile.name} reposted</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 pt-2">
                      <Link to={`/profile/${p.user?.id}`} className="shrink-0">
                        {p.user?.avatar ? (
                          <img src={p.user.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary-light">
                            {p.user?.name?.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </Link>
                      <Link to={`/profile/${p.user?.id}`} className="text-sm font-semibold hover:text-primary-light transition-colors">
                        {p.user?.name}
                      </Link>
                    </div>
                    {p.type === 'IMAGE' && (
                      <div onClick={() => setOpenPost(p)} className="cursor-pointer">
                        {p.media?.length > 0 ? (
                          <ImageCarousel urls={p.media.map((m: any) => m.url)} alt={p.title || ''} />
                        ) : p.mediaUrl ? (
                          <img src={p.mediaUrl} alt={p.title || ''} className="w-full max-h-[32rem] object-contain bg-black" />
                        ) : null}
                      </div>
                    )}
                    {p.mediaUrl && p.type === 'HIGHLIGHT' && (
                      <video src={p.mediaUrl} className="w-full aspect-video object-cover" controls preload="metadata" />
                    )}
                    <div onClick={() => setOpenPost(p)} className="p-3 cursor-pointer">
                      {p.title && <p className="text-sm font-medium mb-1">{p.title}</p>}
                      {p.content && <p className="text-sm text-gray-custom leading-relaxed">{p.content}</p>}
                      <p className="text-xs text-gray-custom mt-1">{timeAgo(p.createdAt)}</p>
                    </div>
                    <PostActions
                      post={p}
                      invalidateKeys={[['user-reposts', id as string]]}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Rankings */}
          {rankings.length > 0 && (
            <div className="bg-dark-light rounded-xl border border-dark-lighter p-5">
              <h2 className="font-semibold flex items-center gap-2 mb-4"><Trophy size={16} className="text-secondary" />Rankings</h2>
              <div className="space-y-3">
                {rankings.slice(0, 3).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{r.tournament?.name ?? 'Overall'}</p>
                      <p className="text-xs text-gray-custom">{r.category}</p>
                    </div>
                    <span className="font-bold text-secondary">#{r.rank}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Teams */}
          {teams.length > 0 && (
            <div className="bg-dark-light rounded-xl border border-dark-lighter p-5">
              <h2 className="font-semibold flex items-center gap-2 mb-4"><Users size={16} className="text-accent" />Teams</h2>
              <div className="space-y-2">
                {teams.map((t: any) => (
                  <div
                    key={t.id}
                    className="block text-sm py-2 px-3 rounded-lg bg-dark"
                  >
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-gray-custom">{t.sport}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Followers / Following modal */}
      {followModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setFollowModal(null)}
        >
          <div
            className="bg-dark-light border border-white/10 rounded-xl w-full max-w-sm max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex gap-4 text-sm font-semibold">
                <button
                  onClick={() => setFollowModal('followers')}
                  className={followModal === 'followers' ? 'text-white' : 'text-white/40 hover:text-white/70'}
                >
                  Followers
                </button>
                <button
                  onClick={() => setFollowModal('following')}
                  className={followModal === 'following' ? 'text-white' : 'text-white/40 hover:text-white/70'}
                >
                  Following
                </button>
              </div>
              <button onClick={() => setFollowModal(null)} className="text-white/40 hover:text-white text-xl leading-none">×</button>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 p-2">
              {followListLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !followListData?.users?.length ? (
                <p className="text-center text-white/30 text-sm py-8">
                  {followModal === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                </p>
              ) : (
                followListData.users.map((u: any) => (
                  <Link
                    key={u.id}
                    to={`/profile/${u.id}`}
                    onClick={() => setFollowModal(null)}
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
                        {u.sport && u.role !== 'ADMIN' && ` · ${u.sport.toLowerCase()}`}
                        {u.position && ` · ${u.position}`}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share profile in DM */}
      {shareDmOpen && (
        <ShareProfileModal profileId={profile.id} onClose={() => setShareDmOpen(false)} />
      )}

      {/* Report user modal */}
      {reportModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => !submittingReport && setReportModal(false)}
        >
          <div
            className="w-full max-w-md bg-dark-light border border-dark-lighter rounded-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-1">Report {profile.name}</h3>
            <p className="text-xs text-gray-custom mb-4">Reports are reviewed by admins. False reports may impact your account.</p>
            <label className="block text-xs text-gray-custom mb-1">Reason</label>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary mb-3"
            >
              <option value="">Select a reason</option>
              <option value="spam">Spam</option>
              <option value="harassment">Harassment or hateful behavior</option>
              <option value="impersonation">Impersonation</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="other">Other</option>
            </select>
            <label className="block text-xs text-gray-custom mb-1">Details (optional)</label>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Add any extra context"
              className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setReportModal(false); setReportReason(''); setReportDetails(''); }}
                disabled={submittingReport}
                className="flex-1 py-2 bg-dark-lighter hover:bg-dark border border-dark-lighter text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!reportReason || submittingReport}
                onClick={async () => {
                  setSubmittingReport(true);
                  try {
                    await api.post(`/users/report/${id}`, { reason: reportReason, details: reportDetails || undefined });
                    toast.success('Report submitted');
                    setReportModal(false);
                    setReportReason('');
                    setReportDetails('');
                  } catch {
                    toast.error('Failed to submit report');
                  } finally {
                    setSubmittingReport(false);
                  }
                }}
                className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {submittingReport ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {openPost && (
        <PostDetailModal
          post={openPost}
          onClose={() => setOpenPost(null)}
          invalidateKeys={[
            ['user-posts', id as string],
            ['user-reposts', id as string],
          ]}
        />
      )}
    </div>
  );
}

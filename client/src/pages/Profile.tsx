import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { MapPin, Users, Trophy, Video, UserPlus, UserCheck, UserMinus, Edit, Calendar, Ruler, Trash2, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import ImageCarousel from '../components/ImageCarousel';

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

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isOwnProfile = me?.id === id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['profile', id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}`);
      return data;
    },
    enabled: !!id,
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Card */}
      <div className="bg-dark-light rounded-xl border border-dark-lighter p-6 relative overflow-hidden">
        {(() => {
          const Backdrop = profile.role !== 'ADMIN'
            ? { CRICKET: CricketPitchBackdrop, BASKETBALL: BasketballCourtBackdrop, FOOTBALL: FootballPitchBackdrop }[profile.sport as string]
            : undefined;
          return Backdrop ? <div className="absolute inset-0 pointer-events-none opacity-[0.10] md:opacity-[0.22]"><Backdrop /></div> : null;
        })()}
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
                  {profile.verified && (
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
              <div>
                <span className="font-bold text-white">{profile._count?.followers ?? 0}</span>
                <span className="text-white/70 ml-1">Followers</span>
              </div>
              <div>
                <span className="font-bold text-white">{profile._count?.following ?? 0}</span>
                <span className="text-white/70 ml-1">Following</span>
              </div>
              <div>
                <span className="font-bold text-white">{highlights.length}</span>
                <span className="text-white/70 ml-1">Highlights</span>
              </div>
            </div>

            {profile.bio && (
              <p className="mt-4 text-sm text-white/75 leading-relaxed">{profile.bio}</p>
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
                {posts.map((p: any) => (
                  <div key={p.id} className="bg-dark rounded-lg border border-dark-lighter overflow-hidden">
                    {p.type === 'IMAGE' && (p.media?.length > 0 ? (
                      <ImageCarousel urls={p.media.map((m: any) => m.url)} alt={p.title || ''} />
                    ) : p.mediaUrl ? (
                      <img src={p.mediaUrl} alt={p.title || ''} className="w-full max-h-64 object-cover" />
                    ) : null)}
                    {p.mediaUrl && p.type === 'HIGHLIGHT' && (
                      <video src={p.mediaUrl} className="w-full aspect-video object-cover" controls preload="metadata" />
                    )}
                    <div className="p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
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
                  <Link
                    key={t.id}
                    to="/teams"
                    className="block text-sm py-2 px-3 rounded-lg bg-dark hover:bg-dark-lighter transition-colors"
                  >
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-gray-custom">{t.sport}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

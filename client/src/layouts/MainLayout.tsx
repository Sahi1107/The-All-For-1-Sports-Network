import { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import {
  Home, Search, Trophy, BarChart3, TrendingUp,
  Bell, MessageSquare, Settings, LogOut, Megaphone, Shield, Plus, X, Menu, Zap,
} from 'lucide-react';
import { useLogo } from '../hooks/useLogo';
import CreatePostModal from '../components/CreatePostModal';

export default function MainLayout() {
  const logoUrl = useLogo();
  const { user, logout } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Unread notification count
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => { const { data } = await api.get('/notifications?limit=1'); return data; },
    refetchInterval: 30000,
  });
  const unreadNotifs = notifData?.unreadCount ?? 0;

  // Pending connection requests count
  const { data: reqData } = useQuery({
    queryKey: ['connection-requests'],
    queryFn: async () => { const { data } = await api.get('/connections/requests'); return data; },
    refetchInterval: 30000,
  });
  const pendingRequests = reqData?.requests?.length ?? 0;

  // Unread message conversations count (distinct senders with new messages)
  const { data: msgUnreadData } = useQuery({
    queryKey: ['messages-unread'],
    queryFn: async () => { const { data } = await api.get('/messages/unread-count'); return data; },
    refetchInterval: 30000,
  });
  const unreadMessages = msgUnreadData?.count ?? 0;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Profile completeness check for "!" badge
  // Gender is required for everyone except teams (and admins) so men's/women's
  // rankings stay separate; existing profiles are nagged until they set it.
  const needsGender = !!(user && user.role !== 'ADMIN' && user.role !== 'TEAM' && !user.gender);
  const profileIncomplete = !!(user && user.role !== 'ADMIN' && (!user.bio || !user.avatar || !user.location || !user.age || !user.position)) || needsGender;

  const navItems = [
    { to: '/home',          icon: Home,          label: 'Home' },
    { to: '/explore',       icon: Search,        label: 'Explore' },
    { to: '/grow',          icon: TrendingUp,    label: 'Grow' },
    { to: '/tournaments',   icon: Trophy,        label: 'Tournaments' },
    { to: '/rankings',      icon: BarChart3,     label: 'Rankings' },
    ...(user?.role === 'COACH' || user?.role === 'SCOUT' || user?.role === 'AGENT'
      ? [{ to: '/scout-copilot', icon: Zap, label: 'Scout Copilot' }]
      : []),
    ...(user?.role === 'COACH' || user?.role === 'SCOUT' || user?.role === 'AGENT'
      ? [{ to: '/announcements', icon: Megaphone, label: 'Announcements' }]
      : []),
    { to: '/messages',      icon: MessageSquare, label: 'Messages' },
    { to: '/notifications', icon: Bell,          label: 'Notifications' },
    ...(user?.role === 'ADMIN'
      ? [{ to: '/admin', icon: Shield, label: 'Admin' }]
      : []),
  ];

  // Badge map — routes that should show a red dot
  const badgeMap: Record<string, boolean> = {
    '/notifications': unreadNotifs > 0,
    '/grow': pendingRequests > 0,
    '/messages': unreadMessages > 0,
  };
  // Optional numeric count rendered inside the badge dot
  const badgeCountMap: Record<string, number> = {
    '/messages': unreadMessages,
  };

  // Bottom nav — key items for mobile
  const bottomNav = [
    { to: '/home',          icon: Home,          label: 'Home' },
    { to: '/explore',       icon: Search,        label: 'Explore' },
    { to: '/grow',          icon: TrendingUp,    label: 'Grow' },
    { to: '/notifications', icon: Bell,          label: 'Alerts' },
    { to: `/profile/${user?.id}`, icon: null,    label: 'Profile' },
  ];

  const isActive = (to: string) =>
    to === '/home' ? location.pathname === '/home' : location.pathname.startsWith(to);

  // Small red dot / count badge rendered over a rail icon.
  const Badge = ({ to }: { to: string }) =>
    badgeMap[to] ? (
      badgeCountMap[to] ? (
        <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-surface">
          {badgeCountMap[to] > 9 ? '9+' : badgeCountMap[to]}
        </span>
      ) : (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-surface" />
      )
    ) : null;

  return (
    <div className="min-h-screen bg-surface md:bg-elevated">

      {/* ── DESKTOP LOGO (top corner, outside the rail) ──────────── */}
      <Link
        to="/home"
        title="Home"
        className="hidden md:flex fixed left-3 top-3 w-[76px] h-[92px] z-50 items-center justify-center"
      >
        <img src={logoUrl} alt="All For 1" className="h-[76px] w-auto" />
      </Link>

      {/* ── DESKTOP ICON RAIL (hidden on mobile) ─────────────────── */}
      <aside className="hidden md:flex fixed left-3 top-[108px] bottom-3 w-[76px] z-50 flex-col items-center rounded-[26px] bg-surface border border-ink/10 shadow-xl py-4">
        {/* Nav icons */}
        <nav className="flex-1 w-full flex flex-col items-center gap-1.5 overflow-y-auto no-scrollbar">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = isActive(to);
            return (
              <Link key={to} to={to} title={label} aria-label={label}
                className={`relative w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                  active ? 'bg-primary text-on-primary' : 'text-gray-custom hover:bg-ink/10 hover:text-foreground'
                }`}
              >
                <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
                <Badge to={to} />
              </Link>
            );
          })}
        </nav>

        {/* Bottom utilities */}
        <div className="w-full mt-3 pt-3 border-t border-ink/10 flex flex-col items-center gap-1.5 shrink-0">
          <button onClick={() => setShowCreate(true)} title="Create Post" aria-label="Create Post"
            className="w-11 h-11 rounded-2xl bg-primary text-on-primary flex items-center justify-center hover:bg-primary-dark transition-colors"
          >
            <Plus size={22} />
          </button>
          <Link to={`/profile/${user?.id}`} title="Profile"
            className="relative w-11 h-11 rounded-2xl flex items-center justify-center hover:bg-ink/10 transition-colors"
          >
            {user?.avatar
              ? <img src={user.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
              : <div className="w-8 h-8 rounded-full bg-ink/10 border border-ink/20 flex items-center justify-center text-sm font-bold text-primary">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
            }
            {profileIncomplete && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-yellow-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-surface">!</span>
            )}
          </Link>
          <Link to="/settings" title="Settings" aria-label="Settings"
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-gray-custom hover:bg-ink/10 hover:text-foreground transition-colors"
          ><Settings size={20} /></Link>
          <button onClick={handleLogout} title="Sign Out" aria-label="Sign Out"
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-gray-custom hover:bg-ink/10 hover:text-red-400 transition-colors"
          ><LogOut size={20} /></button>
        </div>
      </aside>

      {/* ── MOBILE TOP HEADER (hidden on desktop) ────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center px-4 py-3 border-b border-ink/10"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <button onClick={() => setDrawerOpen(true)} className="p-2 text-gray-custom hover:text-foreground transition-colors w-10">
          <Menu size={22} />
        </button>
        <div className="flex-1 flex justify-center">
          <Link to="/home"><img src={logoUrl} alt="All For 1" className="h-9" /></Link>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold text-xs rounded-lg transition-colors w-10 justify-center"
        >
          <Plus size={15} />
        </button>
      </header>

      {/* ── MOBILE DRAWER ─────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          {/* Panel */}
          <div className="relative w-72 h-full flex flex-col border-r border-ink/10 z-10"
            style={{ background: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(24px)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink/10">
              <img src={logoUrl} alt="All For 1" className="h-10" />
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 text-gray-custom hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            {/* User info */}
            <Link to={`/profile/${user?.id}`} onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 px-5 py-4 border-b border-ink/10 hover:bg-ink/5 transition-colors"
            >
              <span className="relative shrink-0">
                {user?.avatar
                  ? <img src={user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  : <div className="w-10 h-10 rounded-full bg-ink/10 border border-ink/20 flex items-center justify-center font-bold text-primary">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                }
                {profileIncomplete && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-surface">!</span>
                )}
              </span>
              <div className="min-w-0">
                <p className="font-medium truncate">{user?.name}</p>
                <p className="text-xs text-gray-custom capitalize">{user?.role?.toLowerCase()} · {user?.sport?.toLowerCase()}</p>
              </div>
            </Link>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map(({ to, icon: Icon, label }) => {
                const active = isActive(to);
                const hasBadge = badgeMap[to];
                return (
                  <Link key={to} to={to} onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      active ? 'bg-primary text-on-primary font-semibold' : 'text-gray-custom hover:bg-ink/10 hover:text-foreground'
                    }`}
                  >
                    <span className="relative">
                      <Icon size={20} />
                      {hasBadge && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
                    </span>
                    <span className="font-medium">{label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Settings + Logout */}
            <div className="p-3 border-t border-ink/10 space-y-1">
              <Link to="/settings" onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-custom hover:bg-ink/10 hover:text-foreground transition-colors"
              >
                <Settings size={20} /><span className="font-medium">Settings</span>
              </Link>
              <button onClick={() => { setDrawerOpen(false); handleLogout(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-custom hover:bg-ink/10 hover:text-red-400 transition-colors"
              >
                <LogOut size={20} /><span className="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
      <main className="min-h-screen md:pl-[92px] md:pr-3 md:py-3">
        {/* Spacer for mobile top header */}
        <div className="md:hidden h-16" />
        <div className="relative md:min-h-[calc(100vh-1.5rem)] md:rounded-[26px] md:bg-surface md:border md:border-ink/10 md:shadow-xl">
        <div className="max-w-5xl mx-auto px-4 py-4 md:px-8 md:py-7 pb-24 md:pb-10">
          {profileIncomplete && (
            <Link to="/profile/edit"
              className="flex items-center gap-3 p-3 mb-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/15 transition-colors"
            >
              <span className="w-8 h-8 bg-yellow-500 text-black rounded-full flex items-center justify-center text-sm font-bold shrink-0">!</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-yellow-400">Complete your profile</p>
                <p className="text-xs text-yellow-400/60 mt-0.5">
                  {needsGender
                    ? 'Select your gender to be placed in the rankings, and add your bio, avatar, location, age, and position to get verified'
                    : 'Add your bio, avatar, location, age, and position to get verified'}
                </p>
              </div>
              <span className="text-xs text-yellow-400/80 font-medium shrink-0">Edit</span>
            </Link>
          )}
          <Outlet />
        </div>
        </div>
        {/* Spacer for mobile bottom nav */}
        <div className="md:hidden h-16" />
      </main>

      {/* ── MOBILE BOTTOM NAV ─────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2 border-t border-ink/10"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        {bottomNav.map(({ to, icon: Icon, label }) => {
          const active = isActive(to);
          const hasBadge = badgeMap[to];
          return (
            <Link key={to} to={to}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                active ? 'text-primary' : 'text-gray-custom hover:text-foreground'
              }`}
            >
              <span className="relative">
                {Icon
                  ? <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                  : (user?.avatar
                      ? <img src={user.avatar} className={`w-6 h-6 rounded-full object-cover ${active ? 'ring-2 ring-primary' : ''}`} />
                      : <div className={`w-6 h-6 rounded-full bg-ink/10 flex items-center justify-center text-xs font-bold ${active ? 'ring-2 ring-primary text-primary' : 'text-gray-custom'}`}>
                          {user?.name?.charAt(0).toUpperCase()}
                        </div>
                    )
                }
                {hasBadge && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-surface" />}
                {!Icon && profileIncomplete && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-500 text-black text-[8px] font-bold rounded-full flex items-center justify-center ring-1 ring-surface">!</span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      {showCreate && <CreatePostModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

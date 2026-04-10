import { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import {
  Home, Search, Trophy, BarChart3, TrendingUp,
  Bell, MessageSquare, Settings, LogOut, Megaphone, Shield, Plus, X, Menu, Zap,
} from 'lucide-react';
import logoUrl from '../assets/logo.svg';
import CreatePostModal from '../components/CreatePostModal';

export default function MainLayout() {
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/',              icon: Home,          label: 'Home' },
    { to: '/explore',       icon: Search,        label: 'Explore' },
    { to: '/grow',          icon: TrendingUp,    label: 'Grow' },
    { to: '/tournaments',   icon: Trophy,        label: 'Tournaments' },
    { to: '/rankings',      icon: BarChart3,     label: 'Rankings' },
    ...(user?.role === 'COACH' || user?.role === 'SCOUT'
      ? [{ to: '/scout-copilot', icon: Zap, label: 'Scout Copilot' }]
      : []),
    ...(user?.role === 'COACH' || user?.role === 'SCOUT'
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
  };

  // Bottom nav — key items for mobile
  const bottomNav = [
    { to: '/',              icon: Home,          label: 'Home' },
    { to: '/explore',       icon: Search,        label: 'Explore' },
    { to: '/grow',          icon: TrendingUp,    label: 'Grow' },
    { to: '/notifications', icon: Bell,          label: 'Alerts' },
    { to: `/profile/${user?.id}`, icon: null,    label: 'Profile' },
  ];

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <div className="flex min-h-screen bg-dark">

      {/* ── DESKTOP SIDEBAR (hidden on mobile) ───────────────────── */}
      <aside
        className="hidden md:flex fixed left-0 top-0 h-full w-64 border-r border-white/10 flex-col z-50"
        style={{ background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10 flex justify-center">
          <Link to="/"><img src={logoUrl} alt="All For 1" style={{ height: '100px', width: 'auto' }} /></Link>
        </div>

        {/* Create Post */}
        <div className="px-4 pt-4">
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-dark font-semibold text-sm rounded-lg transition-colors"
          >
            <Plus size={18} />Create Post
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = isActive(to);
            const hasBadge = badgeMap[to];
            return (
              <Link key={to} to={to}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  active ? 'bg-primary text-dark font-semibold' : 'text-gray-custom hover:bg-white/10 hover:text-white'
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

        {/* User */}
        <div className="p-4 border-t border-white/10">
          <Link to={`/profile/${user?.id}`}
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
          >
            {user?.avatar
              ? <img src={user.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
              : <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-sm font-bold text-primary">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-gray-custom capitalize">{user?.role?.toLowerCase()}</p>
            </div>
          </Link>
          <div className="flex gap-2 mt-2">
            <Link to="/settings"
              className="flex-1 flex items-center justify-center px-3 py-2 text-gray-custom hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            ><Settings size={16} /></Link>
            <button onClick={handleLogout}
              className="flex-1 flex items-center justify-center px-3 py-2 text-gray-custom hover:text-red-400 rounded-lg hover:bg-white/10 transition-colors"
            ><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* ── MOBILE TOP HEADER (hidden on desktop) ────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center px-4 py-3 border-b border-white/10"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <button onClick={() => setDrawerOpen(true)} className="p-2 text-gray-custom hover:text-white transition-colors w-10">
          <Menu size={22} />
        </button>
        <div className="flex-1 flex justify-center">
          <Link to="/"><img src={logoUrl} alt="All For 1" className="h-9" /></Link>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-dark font-semibold text-xs rounded-lg transition-colors w-10 justify-center"
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
          <div className="relative w-72 h-full flex flex-col border-r border-white/10 z-10"
            style={{ background: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(24px)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <img src={logoUrl} alt="All For 1" className="h-10" />
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 text-gray-custom hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* User info */}
            <Link to={`/profile/${user?.id}`} onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 px-5 py-4 border-b border-white/10 hover:bg-white/5 transition-colors"
            >
              {user?.avatar
                ? <img src={user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                : <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center font-bold text-primary">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
              }
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
                      active ? 'bg-primary text-dark font-semibold' : 'text-gray-custom hover:bg-white/10 hover:text-white'
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
            <div className="p-3 border-t border-white/10 space-y-1">
              <Link to="/settings" onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-custom hover:bg-white/10 hover:text-white transition-colors"
              >
                <Settings size={20} /><span className="font-medium">Settings</span>
              </Link>
              <button onClick={() => { setDrawerOpen(false); handleLogout(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-custom hover:bg-white/10 hover:text-red-400 transition-colors"
              >
                <LogOut size={20} /><span className="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
      <main className="flex-1 min-h-screen md:ml-64">
        {/* Spacer for mobile top header */}
        <div className="md:hidden h-16" />
        <div className="max-w-4xl mx-auto px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-6">
          <Outlet />
        </div>
        {/* Spacer for mobile bottom nav */}
        <div className="md:hidden h-16" />
      </main>

      {/* ── MOBILE BOTTOM NAV ─────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2 border-t border-white/10"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        {bottomNav.map(({ to, icon: Icon, label }) => {
          const active = isActive(to);
          const hasBadge = badgeMap[to];
          return (
            <Link key={to} to={to}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                active ? 'text-primary' : 'text-gray-custom hover:text-white'
              }`}
            >
              <span className="relative">
                {Icon
                  ? <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                  : (user?.avatar
                      ? <img src={user.avatar} className={`w-6 h-6 rounded-full object-cover ${active ? 'ring-2 ring-primary' : ''}`} />
                      : <div className={`w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold ${active ? 'ring-2 ring-primary text-primary' : 'text-gray-custom'}`}>
                          {user?.name?.charAt(0).toUpperCase()}
                        </div>
                    )
                }
                {hasBadge && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-black" />}
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

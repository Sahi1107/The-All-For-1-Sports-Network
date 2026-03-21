import { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Home, Search, Users, Trophy, BarChart3,
  Bell, MessageSquare, Settings, LogOut, Megaphone, Shield, Plus
} from 'lucide-react';
import logoUrl from '../assets/logo.svg';
import CreatePostModal from '../components/CreatePostModal';

export default function MainLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/explore', icon: Search, label: 'Explore' },
    { to: '/teams', icon: Users, label: 'Teams' },
    { to: '/tournaments', icon: Trophy, label: 'Tournaments' },
    { to: '/rankings', icon: BarChart3, label: 'Rankings' },
    ...(user?.role === 'COACH' || user?.role === 'SCOUT'
      ? [{ to: '/announcements', icon: Megaphone, label: 'Announcements' }]
      : []),
    { to: '/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/notifications', icon: Bell, label: 'Notifications' },
    ...(user?.role === 'ADMIN'
      ? [{ to: '/admin', icon: Shield, label: 'Admin' }]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 h-full w-64 border-r border-white/10 flex flex-col z-50"
        style={{
          background: 'rgba(0,0,0,0.15)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10 flex justify-center">
          <Link to="/">
            <img src={logoUrl} alt="All For 1" style={{ height: '100px', width: 'auto' }} />
          </Link>
        </div>

        {/* Create Post button */}
        <div className="px-4 pt-4">
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-dark font-semibold text-sm rounded-lg transition-colors"
          >
            <Plus size={18} />
            Create Post
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  active
                    ? 'bg-primary text-dark font-semibold'
                    : 'text-gray-custom hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-white/10">
          <Link
            to={`/profile/${user?.id}`}
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-sm font-bold text-primary">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-gray-custom capitalize">{user?.role?.toLowerCase()}</p>
            </div>
          </Link>
          <div className="flex gap-2 mt-2">
            <Link
              to="/settings"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-custom hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <Settings size={16} />
            </Link>
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-custom hover:text-red-400 rounded-lg hover:bg-white/10 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 flex-1 min-h-screen">
        <div className="max-w-4xl mx-auto p-6">
          <Outlet />
        </div>
      </main>

      {/* Create Post Modal */}
      {showCreate && <CreatePostModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

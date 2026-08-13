import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLogo } from '../hooks/useLogo';
import { Home, Compass, Search, ArrowLeft } from 'lucide-react';

/**
 * Real 404 — replaces the old silent redirect to /home. Adapts to auth state so
 * both a logged-in and a logged-out visitor get sensible ways back, rather than
 * being dumped somewhere random with no explanation.
 */
export default function NotFound() {
  const { user } = useAuth();
  const logo = useLogo();
  const primary = user ? { to: '/home', label: 'Home', Icon: Home } : { to: '/', label: 'Home', Icon: Home };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 text-center">
      <Link to={primary.to} aria-label="All For 1 home" className="mb-10">
        <img src={logo} alt="All For 1" className="h-11 w-auto" />
      </Link>

      <p className="font-display font-extrabold leading-none text-[88px] md:text-[120px] text-primary/15 select-none">404</p>
      <h1 className="text-2xl md:text-3xl font-bold -mt-3 md:-mt-5">Page not found</h1>
      <p className="text-gray-custom mt-3 max-w-sm text-sm md:text-base">
        The page you're looking for doesn't exist or may have moved. Let's get you back on track.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
        <Link to={primary.to}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary font-semibold rounded-xl hover:bg-primary-dark transition-colors">
          <primary.Icon size={17} /> {primary.label}
        </Link>
        {user ? (
          <>
            <Link to="/explore"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-elevated border border-line text-foreground rounded-xl hover:bg-surface transition-colors">
              <Compass size={17} /> Explore
            </Link>
            <Link to="/explore"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-elevated border border-line text-foreground rounded-xl hover:bg-surface transition-colors">
              <Search size={17} /> Search
            </Link>
          </>
        ) : (
          <Link to="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-elevated border border-line text-foreground rounded-xl hover:bg-surface transition-colors">
            <ArrowLeft size={17} /> Log in
          </Link>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import logoUrl from '../assets/logo.svg';

/**
 * Shared marketing header used by the landing sub-pages (How it works,
 * For scouts). Transparent over the page's dark hero band, gains a solid
 * blurred backdrop once scrolled so the links stay legible. All links are
 * real routes — no in-page scrolling here.
 */
export default function LandingHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // On the landing itself, "Home" scrolls to the top instead of a no-op nav.
  const goHome = () => {
    if (location.pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
    else navigate('/');
  };

  return (
    <header className={`lp-header ${scrolled ? 'is-solid' : ''}`}>
      <div className="lp-bar">
        <button className="lp-logo" onClick={goHome} aria-label="All For 1 home">
          <img src={logoUrl} alt="All For 1" />
        </button>
        <nav className="lp-nav" aria-label="Primary">
          <button className="lp-link" onClick={goHome}>Home</button>
          <button className="lp-link" onClick={() => navigate('/how-it-works')}>How it works</button>
          <button className="lp-link" onClick={() => navigate('/for-scouts')}>For scouts</button>
          <button className="lp-link" onClick={() => navigate('/challenges')}>Challenges</button>
          <span className="lp-actions">
            <button className="lp-login" onClick={() => navigate('/login')}>Log In</button>
            <button className="lp-signup" onClick={() => navigate('/register')}>Sign Up</button>
          </span>
        </nav>
      </div>
    </header>
  );
}

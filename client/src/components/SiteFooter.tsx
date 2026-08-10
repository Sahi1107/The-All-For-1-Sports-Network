import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoUrl from '../assets/logo.svg';
import './SiteFooter.css';

/**
 * The shared site footer. Self-contained styling (no dependency on landing.css
 * or a .landing-root wrapper) so it drops onto any page, including the Tailwind
 * auth screens. Landing-section links scroll in place on the landing and route
 * back to it from anywhere else.
 */
export default function SiteFooter() {
  const navigate = useNavigate();
  const location = useLocation();

  const goSection = (id: string) => {
    if (location.pathname === '/') {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(`/#${id}`);
    }
  };

  return (
    <footer className="sf">
      <div className="sf-inner">
        <div className="sf-brand">
          <img src={logoUrl} alt="All For 1" className="sf-logo" />
          <p>The verified data layer for Indian grassroots sport.</p>
        </div>

        <div className="sf-col">
          <h5>Product</h5>
          <button type="button" onClick={() => goSection('home')}>Home</button>
          <button type="button" onClick={() => goSection('about')}>About</button>
          <button type="button" onClick={() => goSection('team')}>Team</button>
          <Link to="/challenges">Challenges</Link>
          <Link to="/register">Sign Up</Link>
        </div>

        <div className="sf-col">
          <h5>Company</h5>
          <button type="button" onClick={() => goSection('about')}>About</button>
          <button type="button" onClick={() => goSection('team')}>Team</button>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/for-scouts">For scouts</Link>
          <a href="mailto:info@allfor1.pro">Contact</a>
        </div>

        <div className="sf-col">
          <h5>Legal</h5>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </div>
      </div>

      <div className="sf-bar">
        <span>&copy; {new Date().getFullYear()} The AllFor1 Network. All rights reserved.</span>
        <span className="sf-bar-links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </span>
      </div>
    </footer>
  );
}

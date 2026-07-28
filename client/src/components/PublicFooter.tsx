import { Link } from 'react-router-dom';
import logoUrl from '../assets/logo.svg';
import '../pages/landing.css';

/**
 * Full public footer for logged-out content pages (Terms, Privacy — via
 * LegalDoc). Uses the same l-footer styling and link set as the Landing /
 * Challenges footers so every public page shares one trust/navigation surface.
 * SSR pages (About/Safety/Community Guidelines/FAQ) use hard-nav <a href>;
 * in-app routes use <Link>.
 */
export default function PublicFooter() {
  return (
    <footer className="l-footer">
      <div className="l-footer__inner">
        <div>
          <img src={logoUrl} alt="All For 1" className="footer-logo" />
          <p>The verified data layer for Indian grassroots sport.</p>
        </div>
        <div className="l-footer__col">
          <h5>Product</h5>
          <Link to="/">Home</Link>
          <Link to="/challenges">Challenges</Link>
          <Link to="/login">Sign Up</Link>
        </div>
        <div className="l-footer__col">
          <h5>Company</h5>
          <a href="/about">About</a>
          <a href="/safety">Safety</a>
          <a href="/community-guidelines">Community Guidelines</a>
          <a href="/faq">FAQ</a>
          <a href="mailto:info@allfor1.pro">Contact</a>
        </div>
        <div className="l-footer__col">
          <h5>Legal</h5>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </div>
      </div>
      <div className="l-footer__bar">
        <span>&copy; {new Date().getFullYear()} The AllFor1 Network. All rights reserved.</span>
        <span>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </span>
      </div>
    </footer>
  );
}

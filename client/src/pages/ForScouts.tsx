import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingHeader from '../components/LandingHeader';
import PageWipe, { useIntro } from '../components/PageWipe';
import logoUrl from '../assets/logo.svg';
import './landing.css';

const CARDS = [
  {
    t: 'Search verified profiles',
    d: 'Filter by sport, position, region and ranking to shortlist in minutes.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    t: 'Trust the numbers',
    d: 'Stats are recorded at the event, not self-reported. What you see is what happened.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    t: 'Discover on merit',
    d: 'Surface players by performance, from grassroots all the way to pro.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5M4 19h16" />
        <path d="M8 16v-4M12 16V8M16 16v-6" />
      </svg>
    ),
  },
];

export default function ForScouts() {
  const navigate = useNavigate();
  const showWipe = useIntro();

  useEffect(() => {
    document.title = 'For scouts & coaches · All For 1';
  }, []);

  return (
    <div className={`landing-root mkt-page ${showWipe ? 'intro-full' : 'intro-quick'}`}>
      <div className="mkt-bg" aria-hidden />
      {showWipe && <PageWipe />}
      <LandingHeader />

      <section className="mkt-hero">
        <span className="mkt-kicker">For scouts &amp; coaches</span>
        <h1>Find real talent, backed by real data.</h1>
        <p className="mkt-lead">
          Stop guessing from highlight reels. Search a network of athletes whose every stat was
          verified at the source, then reach out on merit.
        </p>
      </section>

      <section className="mkt-sec">
        <div className="mkt-cards">
          {CARDS.map((c) => (
            <article className="mkt-card" key={c.t}>
              <div className="mkt-card-ic">{c.icon}</div>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-cta">
        <h2>Scout smarter. Start free.</h2>
        <div className="mkt-cta-row">
          <button className="btn-primary" onClick={() => navigate('/register')}>
            Create a scout account
          </button>
          <button className="btn-glass" onClick={() => navigate('/how-it-works')}>
            How it works
          </button>
        </div>
      </section>

      <footer className="mkt-foot">
        <img src={logoUrl} alt="All For One" className="mkt-foot-logo" />
        <span className="mkt-foot-links">
          <a href="/">Home</a>
          <a href="/challenges">Challenges</a>
          <a href="mailto:info@allfor1.pro">info@allfor1.pro</a>
        </span>
      </footer>
    </div>
  );
}

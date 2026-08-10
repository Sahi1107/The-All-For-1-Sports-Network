import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingHeader from '../components/LandingHeader';
import PageWipe, { useIntro } from '../components/PageWipe';
import SiteFooter from '../components/SiteFooter';
import './landing.css';

const STEPS = [
  { n: '01', t: 'Compete', d: 'Play in real tournaments and leagues hosted on the network.' },
  { n: '02', t: 'Get verified', d: 'Your stats are recorded live at the source, not typed in later.' },
  { n: '03', t: 'Build your profile', d: 'Every match builds a verified profile and moves you up performance-based rankings.' },
  { n: '04', t: 'Get discovered', d: 'Scouts, coaches and academies find you on merit, from city to national level.' },
];

export default function HowItWorks() {
  const navigate = useNavigate();
  const showWipe = useIntro();

  useEffect(() => {
    document.title = 'How it works · All For 1';
  }, []);

  return (
    <div className={`landing-root mkt-page ${showWipe ? 'intro-full' : 'intro-quick'}`}>
      <div className="mkt-bg" aria-hidden />
      {showWipe && <PageWipe />}
      <LandingHeader />

      <section className="mkt-hero">
        <span className="mkt-kicker">How it works</span>
        <h1>From local matches to a verified profile.</h1>
        <p className="mkt-lead">
          No self-reported hype. Every number on your profile is recorded and verified at a
          real event, then published for scouts and coaches to trust.
        </p>
      </section>

      <section className="mkt-sec">
        <ol className="mkt-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="mkt-step-n">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mkt-cta">
        <h2>The next big player could be you.</h2>
        <div className="mkt-cta-row">
          <button className="btn-primary" onClick={() => navigate('/register')}>
            Create your free profile
          </button>
          <button className="btn-glass" onClick={() => navigate('/for-scouts')}>
            For scouts &amp; coaches
          </button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

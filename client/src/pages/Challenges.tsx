import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoUrl from '../assets/logo.svg';
import './landing.css';

type ChallengeStatus = 'LIVE' | 'UPCOMING' | 'ENDING SOON';

type Challenge = {
  id: string;
  title: string;
  sport: string;
  sportEmoji: string;
  status: ChallengeStatus;
  prize: string;
  duration: string;
  participants: number;
  banner: string;
  teaser: string;
  description: string;
  rules: string[];
  postedBy: {
    name: string;
    handle: string;
    role: string;
    avatar: string;
  };
  postedAt: string;
};

const CHALLENGES: Challenge[] = [
  {
    id: 'dribble-dash',
    title: 'Dribble Dash',
    sport: 'Football',
    sportEmoji: '⚽',
    status: 'LIVE',
    prize: 'Adidas F50 Football Boots',
    duration: 'Closes 24 May 2026, 11:59 PM',
    participants: 0,
    banner:
      'radial-gradient(120% 120% at 0% 0%, rgba(215,255,90,0.55), transparent 55%), linear-gradient(135deg, #14290a 0%, #2d4d10 100%)',
    teaser:
      'A timed cone-weave finished with a shot on goal. Fastest clean run wins.',
    description:
      "A timed individual drill where players weave through a cone course at full speed and finish with a shot on goal. Simple, competitive, and pure skill — the fastest clean run wins. Set up 6 cones in a zigzag line 2 metres apart, with the finish cone positioned 18 metres from goal (edge of the box). On the starter's signal, dribble through all 6 cones without missing any, then take a shot on goal. The clock stops the moment the ball crosses the goal line.",
    rules: [
      'Timing & recording: Run must be filmed on a fixed camera capturing the full cone course and goal in one frame — no panning or zooming.',
      'A visible stopwatch or timer must be placed in front of the camera so it appears on screen throughout the entire run.',
      'No post-edit cuts or jump cuts allowed — video must run uninterrupted from starting signal to ball crossing the line.',
      'Cones must not be kicked, moved, or knocked over — any displaced cone is an automatic disqualification.',
      'Player must clearly pass on the correct side of each cone — footage reviewed at 0.5x speed if disputed.',
      'Ball must be placed at the start position before the timer begins — no rolling start or pre-momentum.',
      'Shot must be taken from behind the penalty spot line — shooting from closer in is a DQ.',
      'Goal must be an official-size goal or clearly marked equivalent.',
      'Video submitted as one unedited file with original metadata intact.',
      "Player must state their name and date at the start of the video before beginning.",
      'Deadline: 24 May 2026, 11:59 PM.',
    ],
    postedBy: {
      name: 'AllFor1 Admin',
      handle: '@allfor1',
      role: 'Official',
      avatar: logoUrl,
    },
    postedAt: 'Just now',
  },
];

const STATUS_TONE: Record<ChallengeStatus, string> = {
  LIVE: 'status-live',
  UPCOMING: 'status-upcoming',
  'ENDING SOON': 'status-ending',
};

export default function Challenges() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Challenge | null>(null);
  const [sportFilter, setSportFilter] = useState<string>('All');

  useEffect(() => {
    document.body.classList.toggle('modal-open', selected !== null);
    return () => document.body.classList.remove('modal-open');
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const sports = ['All', ...Array.from(new Set(CHALLENGES.map((c) => c.sport)))];
  const visible =
    sportFilter === 'All'
      ? CHALLENGES
      : CHALLENGES.filter((c) => c.sport === sportFilter);

  const goToLandingSection = (id: 'home' | 'about' | 'team') => {
    navigate(`/#${id}`);
  };

  return (
    <div className="landing-root challenges-page">
      <header className="glass-header">
        <button
          className="logo"
          onClick={() => navigate('/')}
          aria-label="All For One home"
        >
          <img src={logoUrl} className="logo-anim" alt="All For One" />
        </button>

        <button
          className="nav-signup nav-signup--corner"
          onClick={() => navigate('/login')}
        >
          Sign Up
        </button>

        <nav className="nav-container nav-blue" aria-label="Primary">
          <div className="glass-menu">
            <button className="nav-item" onClick={() => goToLandingSection('home')}>
              Home
            </button>
            <button className="nav-item" onClick={() => goToLandingSection('about')}>
              About
            </button>
            <button className="nav-item" onClick={() => goToLandingSection('team')}>
              Team
            </button>
            <button className="nav-item active" aria-current="page">
              Challenges
            </button>
          </div>
        </nav>
      </header>

      <section className="challenges-hero">
        <div className="challenges-hero-content">
          <span className="challenges-eyebrow">Live on the Network</span>
          <h1>Challenges</h1>
          <p>
            Prove yourself outside the bracket. Real challenges, posted by the AllFor1
            team, open to every athlete on the platform.
          </p>
        </div>
      </section>

      <section className="challenges-section">
        <div className="challenges-section-inner">
          <div className="challenges-filter-row" role="tablist" aria-label="Filter by sport">
            {sports.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={sportFilter === s}
                className={`challenges-chip ${sportFilter === s ? 'is-active' : ''}`}
                onClick={() => setSportFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="challenges-grid">
            {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              className="challenge-card"
              onClick={() => setSelected(c)}
              aria-label={`Open details for ${c.title}`}
            >
              <div className="challenge-banner" style={{ background: c.banner }}>
                <span className={`challenge-status ${STATUS_TONE[c.status]}`}>
                  {c.status}
                </span>
                <span className="challenge-sport-pill">
                  {c.sportEmoji} {c.sport}
                </span>
              </div>
              <div className="challenge-body">
                <h3>{c.title}</h3>
                <p>{c.teaser}</p>
                <div className="challenge-meta">
                  <span>{c.duration}</span>
                  <span aria-hidden>•</span>
                  <span>{c.participants.toLocaleString()} entered</span>
                </div>
                <div className="challenge-prize">
                  <span className="challenge-prize-label">Prize</span>
                  <span className="challenge-prize-value">{c.prize}</span>
                </div>
              </div>
            </button>
            ))}
          </div>

          {visible.length === 0 && (
            <p className="challenges-empty">No challenges live for this sport yet — check back soon.</p>
          )}
        </div>
      </section>

      {selected && (
        <div
          className="challenge-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="challenge-modal-title"
          onClick={() => setSelected(null)}
        >
          <div className="challenge-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="challenge-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              ×
            </button>

            <div
              className="challenge-modal-banner"
              style={{ background: selected.banner }}
            >
              <span className={`challenge-status ${STATUS_TONE[selected.status]}`}>
                {selected.status}
              </span>
              <span className="challenge-sport-pill">
                {selected.sportEmoji} {selected.sport}
              </span>
            </div>

            <div className="challenge-modal-body">
              <h2 id="challenge-modal-title">{selected.title}</h2>
              <div className="challenge-modal-stats">
                <div>
                  <span>Prize</span>
                  <strong>{selected.prize}</strong>
                </div>
                <div>
                  <span>Window</span>
                  <strong>{selected.duration}</strong>
                </div>
                <div>
                  <span>Athletes</span>
                  <strong>{selected.participants.toLocaleString()}</strong>
                </div>
              </div>

              <article className="admin-post">
                <header className="admin-post-head">
                  <img src={selected.postedBy.avatar} alt="" aria-hidden />
                  <div className="admin-post-id">
                    <div className="admin-post-line">
                      <span className="admin-post-name">{selected.postedBy.name}</span>
                      <span className="admin-post-badge">{selected.postedBy.role}</span>
                    </div>
                    <span className="admin-post-meta">
                      {selected.postedBy.handle} · {selected.postedAt}
                    </span>
                  </div>
                </header>
                <p className="admin-post-body">{selected.description}</p>
                <div className="admin-post-rules">
                  <h4>How it works</h4>
                  <ul>
                    {selected.rules.map((rule, i) => (
                      <li key={i}>{rule}</li>
                    ))}
                  </ul>
                </div>
              </article>

              <div className="challenge-modal-cta">
                <button
                  className="btn-primary challenge-signup"
                  onClick={() => navigate('/login')}
                >
                  Sign Up to Enter
                </button>
                <button
                  className="btn-glass challenge-back"
                  onClick={() => setSelected(null)}
                >
                  Back to Challenges
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="l-footer">
        <div className="l-footer__inner">
          <div>
            <img src={logoUrl} alt="All For One" className="footer-logo" />
            <p>The network for the sports ecosystem.</p>
          </div>
          <div className="l-footer__col">
            <h5>Product</h5>
            <Link to="/">Home</Link>
            <Link to="/#about">About</Link>
            <Link to="/#team">Team</Link>
            <Link to="/challenges">Challenges</Link>
            <Link to="/login">Sign Up</Link>
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
    </div>
  );
}

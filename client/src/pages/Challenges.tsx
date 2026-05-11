import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoBlueUrl from '../assets/logo-icon.svg';
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
    id: 'sprint-100m',
    title: '100m Sprint Showdown',
    sport: 'Track & Field',
    sportEmoji: '🏃',
    status: 'LIVE',
    prize: '₹25,000 + Ranking Boost',
    duration: '7 days left',
    participants: 248,
    banner:
      'radial-gradient(120% 120% at 0% 0%, rgba(215,255,90,0.55), transparent 55%), linear-gradient(135deg, #14290a 0%, #2d4d10 100%)',
    teaser:
      'Submit your verified 100m timing and climb the national speed leaderboard.',
    description:
      'The 100m Sprint Showdown is open to all registered athletes across India. Record your timing at any AllFor1 partner venue or affiliated meet, and our verification system will lock your result onto the public leaderboard. Top three finishers earn cash prizes and a permanent ranking boost on their profile.',
    rules: [
      'Timing must be captured at an AllFor1 partner venue with electronic timing.',
      'Athletes between 14 and 24 years are eligible.',
      'One official attempt per athlete; best of two preliminary trials counts.',
      'Submission window closes on 2026-05-18 at 23:59 IST.',
    ],
    postedBy: {
      name: 'AllFor1 Admin',
      handle: '@allfor1',
      role: 'Official',
      avatar: logoBlueUrl,
    },
    postedAt: '2 days ago',
  },
  {
    id: 'free-throw-50',
    title: '50-Shot Free Throw Frenzy',
    sport: 'Basketball',
    sportEmoji: '🏀',
    status: 'LIVE',
    prize: 'Featured profile + ₹10,000',
    duration: '12 days left',
    participants: 412,
    banner:
      'radial-gradient(120% 120% at 100% 0%, rgba(255,140,40,0.6), transparent 55%), linear-gradient(135deg, #2a1407 0%, #4a2611 100%)',
    teaser:
      'Make the most free throws out of 50. Record, upload, and let the rankings settle it.',
    description:
      'How many free throws can you sink out of 50 consecutive attempts? Record a continuous, unedited clip of your run from a single camera angle and upload it through your AllFor1 profile. Our scout panel reviews the top 20 submissions and the highest verified score wins.',
    rules: [
      'One unedited take. The camera cannot pan or cut.',
      'Standard FIBA free throw line distance (4.6m).',
      'Submit by 2026-05-23 at 23:59 IST.',
      'Ties broken by longest consecutive made-shot streak.',
    ],
    postedBy: {
      name: 'AllFor1 Admin',
      handle: '@allfor1',
      role: 'Official',
      avatar: logoBlueUrl,
    },
    postedAt: '4 days ago',
  },
  {
    id: 'serve-speed',
    title: 'Tennis Serve Speed Trial',
    sport: 'Tennis',
    sportEmoji: '🎾',
    status: 'ENDING SOON',
    prize: 'National scout invite',
    duration: '3 days left',
    participants: 137,
    banner:
      'radial-gradient(120% 120% at 0% 100%, rgba(120,220,255,0.55), transparent 55%), linear-gradient(135deg, #051e2a 0%, #0e3a52 100%)',
    teaser:
      'Bring the heat. Fastest verified serve in your age bracket gets a scout invite.',
    description:
      'Show us your fastest serve. Submissions require radar gun data captured at an AllFor1 partner academy. Winners in the U16, U18, and Open categories receive a direct invite to a national-level scouting camp later this season.',
    rules: [
      'Radar gun reading must be visible in the submission clip.',
      'Three serve attempts max; fastest counts.',
      'Categories: U16, U18, Open.',
      'Submission window closes 2026-05-14 at 23:59 IST.',
    ],
    postedBy: {
      name: 'AllFor1 Admin',
      handle: '@allfor1',
      role: 'Official',
      avatar: logoBlueUrl,
    },
    postedAt: '1 week ago',
  },
  {
    id: 'cricket-batting',
    title: '30-Ball Batting Average',
    sport: 'Cricket',
    sportEmoji: '🏏',
    status: 'LIVE',
    prize: 'AllFor1 gear pack',
    duration: '18 days left',
    participants: 521,
    banner:
      'radial-gradient(120% 120% at 100% 100%, rgba(80,255,170,0.45), transparent 55%), linear-gradient(135deg, #0a1f14 0%, #15402a 100%)',
    teaser:
      'Face 30 deliveries, post your runs, and stake your claim on the batting board.',
    description:
      'Step into the nets, face 30 deliveries from a verified bowler or bowling machine, and submit your run tally. Athletes ranked in the top 50 receive an AllFor1 gear pack and a featured slot in the weekly highlights reel.',
    rules: [
      'Continuous footage, single camera angle on the batter.',
      'Bowling machine or verified partner bowler only.',
      'Submission must include a scorer logging each delivery.',
      'Open until 2026-05-29 at 23:59 IST.',
    ],
    postedBy: {
      name: 'AllFor1 Admin',
      handle: '@allfor1',
      role: 'Official',
      avatar: logoBlueUrl,
    },
    postedAt: '5 days ago',
  },
  {
    id: 'football-keepy',
    title: 'Football Skill Streak',
    sport: 'Football',
    sportEmoji: '⚽',
    status: 'LIVE',
    prize: 'Pro academy trial slot',
    duration: '9 days left',
    participants: 304,
    banner:
      'radial-gradient(120% 120% at 0% 0%, rgba(215,90,255,0.45), transparent 55%), linear-gradient(135deg, #1a0a2a 0%, #2e144a 100%)',
    teaser:
      'Three skills, one take, no edits. Show the panel what your touch looks like.',
    description:
      'Record a single uninterrupted clip of yourself performing three different ball-control skills: any juggle sequence, a wall-pass set, and a 1v1 cone weave. Highest cumulative score across all three earns a trial slot at a partner pro academy.',
    rules: [
      'One unedited take. No cuts.',
      'Open to athletes 13–22 years.',
      'Skills judged on control, fluency, and tempo.',
      'Submission window closes 2026-05-20 at 23:59 IST.',
    ],
    postedBy: {
      name: 'AllFor1 Admin',
      handle: '@allfor1',
      role: 'Official',
      avatar: logoBlueUrl,
    },
    postedAt: '3 days ago',
  },
  {
    id: 'endurance-run',
    title: '30-Day Endurance Run',
    sport: 'Running',
    sportEmoji: '🏅',
    status: 'UPCOMING',
    prize: 'Top 10 featured on rankings',
    duration: 'Starts 2026-05-15',
    participants: 1024,
    banner:
      'radial-gradient(120% 120% at 100% 0%, rgba(255,90,140,0.5), transparent 55%), linear-gradient(135deg, #2a070f 0%, #520f1f 100%)',
    teaser:
      'Log every kilometre for 30 days. Highest verified total wins.',
    description:
      'A month-long endurance test for runners at every level. Sync your runs through an AllFor1-supported tracker and your verified kilometres add to your total. Top 10 athletes earn a featured slot on the national endurance leaderboard for the next season.',
    rules: [
      'Runs must be tracked via a supported device or app.',
      'GPS data required for verification; treadmill runs do not count.',
      'Daily cap of 25km to keep things fair.',
      'Challenge runs 2026-05-15 to 2026-06-14.',
    ],
    postedBy: {
      name: 'AllFor1 Admin',
      handle: '@allfor1',
      role: 'Official',
      avatar: logoBlueUrl,
    },
    postedAt: '6 days ago',
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
          <img src={logoBlueUrl} className="logo-anim" alt="All For One" />
        </button>

        <button
          className="nav-signup nav-signup--corner nav-signup--blue"
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
        <div className="challenges-hero-aurora" aria-hidden />
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

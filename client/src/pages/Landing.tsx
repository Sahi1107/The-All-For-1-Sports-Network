import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoUrl from '../assets/logo.svg';
import logoBlueUrl from '../assets/logo-icon.svg';
import './landing.css';

type SectionId = 'home' | 'about' | 'team';

const NAV_LINKS: { id: SectionId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'team', label: 'Team' },
];

const CREATORS = {
  sahil: {
    name: 'Sahil Desai',
    role: 'Founder & Creative Head',
    img: '/c1.jpeg',
    bio: 'A visionary focused on building performance-driven athlete ecosystems.',
  },
  mann: {
    name: 'Mann Agarwal',
    role: 'Co-Founder & Strategy',
    img: '/c2.jpeg',
    bio: 'Drives tournament systems, rankings and long-term growth strategy.',
  },
} as const;

type Creator = (typeof CREATORS)[keyof typeof CREATORS];

const HERO_BALLS = Array.from({ length: 22 }, (_, i) => i);

export default function Landing() {
  const navigate = useNavigate();
  const [active, setActive] = useState<SectionId>('home');
  const [navBlue, setNavBlue] = useState(false);
  const [expandedCreator, setExpandedCreator] = useState<Creator | null>(null);

  const homeRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);
  const infoHubRef = useRef<HTMLElement>(null);
  const teamRef = useRef<HTMLElement>(null);
  const navTrackRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.toggle('modal-open', expandedCreator !== null);
    return () => document.body.classList.remove('modal-open');
  }, [expandedCreator]);

  useEffect(() => {
    const targets = [
      [homeRef.current, 'home'],
      [aboutRef.current, 'about'],
      [teamRef.current, 'team'],
    ] as Array<[HTMLElement | null, SectionId]>;

    if (!('IntersectionObserver' in window)) return;

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = targets.find(([node]) => node === entry.target)?.[1];
          if (id) setActive(id);
        });
      },
      { rootMargin: '-42% 0px -42% 0px', threshold: 0 },
    );

    targets.forEach(([node]) => {
      if (node) sectionObserver.observe(node);
    });

    return () => sectionObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!infoHubRef.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNavBlue(entry.isIntersecting),
      { root: null, threshold: 0, rootMargin: '-100px 0px -90% 0px' },
    );
    observer.observe(infoHubRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!teamRef.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) teamRef.current?.classList.add('visible');
      },
      { threshold: 0.35 },
    );
    observer.observe(teamRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const menu = navTrackRef.current;
    if (!menu) return;
    const activeItem = menu.querySelector<HTMLButtonElement>(`button[data-id="${active}"]`);
    const indicator = menu.querySelector<HTMLSpanElement>('.nav-indicator');
    if (!activeItem || !indicator) return;

    const menuRect = menu.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    indicator.style.width = `${itemRect.width}px`;
    indicator.style.left = `${itemRect.left - menuRect.left}px`;
  }, [active]);

  const jumpTo = (id: SectionId) => {
    const nodes: Record<SectionId, HTMLElement | null> = {
      home: homeRef.current,
      about: aboutRef.current,
      team: teamRef.current,
    };
    nodes[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const moveSpotlight = (event: React.MouseEvent<HTMLElement>) => {
    if (!spotlightRef.current || !teamRef.current) return;
    const rect = teamRef.current.getBoundingClientRect();
    spotlightRef.current.style.left = `${event.clientX - rect.left}px`;
    spotlightRef.current.style.top = `${event.clientY - rect.top}px`;
  };

  return (
    <div className="landing-root">
      <header className="glass-header">
        <button className="logo" onClick={() => jumpTo('home')} aria-label="All For One home">
          <img src={navBlue ? logoBlueUrl : logoUrl} className="logo-anim" alt="All For One" />
        </button>

        <nav className={`nav-container ${navBlue ? 'nav-blue' : ''}`} aria-label="Primary">
          <div className="glass-menu nav-track" ref={navTrackRef}>
            <span className="nav-indicator" />
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                data-id={link.id}
                className={`nav-item ${active === link.id ? 'active' : ''}`}
                onClick={() => jumpTo(link.id)}
              >
                {link.label}
              </button>
            ))}
          </div>
          <button className="nav-signup" onClick={() => navigate('/login')}>
            Sign Up
          </button>
        </nav>
      </header>

      <section id="home" className="hero-wrapper" ref={homeRef}>
        <div className="hero-field" aria-hidden>
          {HERO_BALLS.map((ball) => (
            <span key={ball} className={`hero-ball hero-ball--${(ball % 6) + 1}`} />
          ))}
        </div>

        <div className="hero-content">
          <h1>Performance is the Test. Elite is the Title.</h1>
          <p>India&apos;s First Unified Sports Platform</p>
          <div className="hero-buttons">
            <button className="btn-primary" onClick={() => navigate('/login')}>
              Sign Up
            </button>
            <button className="btn-glass" onClick={() => jumpTo('about')}>
              About All For One
            </button>
          </div>
        </div>
      </section>

      <section id="about" className="about-section" ref={aboutRef}>
        <video
          src="/about.mp4"
          className="about-video"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden
        />
        <div className="about-split">
          <div className="about-text">
            <h2>What Is All For One?</h2>
            <p>
              We create real opportunities for athletes to prove themselves through
              tournaments and rankings.
            </p>
          </div>
        </div>
      </section>

      <section className="info-hub" ref={infoHubRef}>
        <div className="hub-cards">
          <FlipCard
            img="/trophy.png"
            title="Tournaments That Matter"
            back="Competitive events designed to highlight real talent under pressure and reward performance."
          />
          <FlipCard
            img="/graph.png"
            title="Performance-Based Rankings"
            back="Rankings built from real match data and statistics - not opinions or popularity."
          />
          <FlipCard
            img="/eye.png"
            title="Clear Visibility"
            back="Players can track where they stand at city, state, and national levels."
          />
        </div>
      </section>

      <section
        id="team"
        className="who-section"
        ref={teamRef}
        onMouseMove={moveSpotlight}
      >
        <div className="spotlight" ref={spotlightRef} />
        <div className="who-container">
          <div className="who-left">
            <h2>ABOUT ALL FOR ONE</h2>
            <p>
              All For One is a grassroots sports initiative built around a single objective:
              creating real, measurable pathways for athletes to advance based on performance.
              We organize competitive tournaments that produce structured, verified match data,
              allowing players and teams to be evaluated through consistent, objective metrics
              rather than reputation or access.
            </p>
            <h3 className="who-subtitle">Building an Open Sports Community</h3>
            <p>
              All For One is designed to remove traditional gatekeeping in grassroots sports.
              Talent often remains unseen because access to scouts, organizers, and opportunities
              is restricted to limited networks.
            </p>
            <p>
              Instead of relying on closed circles or personal connections, athletes will be able
              to showcase verified performance histories and directly reach the right people
              through the ecosystem. Opportunities become discoverable through merit, not
              proximity.
            </p>
          </div>

          <div className="who-right">
            <h2 className="who-title">Meet the Founders</h2>
            <div className="creator-belt">
              <CreatorCard creator={CREATORS.sahil} onOpen={setExpandedCreator} />
              <CreatorCard creator={CREATORS.mann} onOpen={setExpandedCreator} />
            </div>
          </div>
        </div>

        <div className={`creator-expanded ${expandedCreator ? 'active' : ''}`}>
          {expandedCreator && (
            <>
              <div className="expanded-left">
                <img src={expandedCreator.img} alt={expandedCreator.name} />
              </div>
              <div className="expanded-right">
                <h3>{expandedCreator.name}</h3>
                <h4>{expandedCreator.role}</h4>
                <p>{expandedCreator.bio}</p>
                <button className="close-expanded" onClick={() => setExpandedCreator(null)}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="contact-section">
        <div className="contact-container">
          <div className="contact-left">
            <h2>Contact Us</h2>
            <p>
              Want to host a tournament, partner with us, or join the next big competition?
              Reach out and our team will get back within 24 hours.
            </p>
          </div>
          <form
            className="contact-form"
            onSubmit={(event) => {
              event.preventDefault();
              navigate('/login');
            }}
          >
            <input type="text" placeholder="Your Name" required />
            <input type="email" placeholder="Email Address" required />
            <textarea placeholder="Your message..." rows={4} required />
            <button className="btn-primary" type="submit">
              Send Message
            </button>
          </form>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-footer__inner">
          <div>
            <img src={logoUrl} alt="All For One" className="footer-logo" />
            <p>The network for the sports ecosystem.</p>
          </div>
          <div className="l-footer__col">
            <h5>Product</h5>
            <button onClick={() => jumpTo('home')}>Home</button>
            <button onClick={() => jumpTo('about')}>About</button>
            <button onClick={() => jumpTo('team')}>Team</button>
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

function FlipCard({ img, title, back }: { img: string; title: string; back: string }) {
  return (
    <div className="flip-card">
      <div className="flip-inner">
        <div className="flip-front">
          <div className="hub-icon">
            <img src={img} alt="" aria-hidden />
          </div>
          <h3>{title}</h3>
        </div>
        <div className="flip-back">
          <p>{back}</p>
        </div>
      </div>
    </div>
  );
}

function CreatorCard({
  creator,
  onOpen,
}: {
  creator: Creator;
  onOpen: (creator: Creator) => void;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  const onMouseMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    const card = cardRef.current;
    const glow = glowRef.current;
    if (!card || !glow) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    card.style.setProperty('--tilt-x', `${x * 0.18}px`);
    card.style.setProperty('--tilt-y', `${y * 0.18}px`);
    glow.style.left = `${event.clientX - rect.left}px`;
    glow.style.top = `${event.clientY - rect.top}px`;
  };

  return (
    <button
      ref={cardRef}
      className="creator-card"
      onClick={() => onOpen(creator)}
      onMouseMove={onMouseMove}
      onMouseLeave={() => {
        cardRef.current?.style.setProperty('--tilt-x', '0px');
        cardRef.current?.style.setProperty('--tilt-y', '0px');
      }}
    >
      <div className="creator-inner">
        <img src={creator.img} alt={creator.name} />
        <div className="creator-glow" ref={glowRef} />
      </div>
      <span className="creator-name">{creator.name}</span>
    </button>
  );
}

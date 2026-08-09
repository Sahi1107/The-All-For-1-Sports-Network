import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoUrl from '../assets/logo.svg';
import LandingHeader from '../components/LandingHeader';
import { useIntro } from '../components/PageWipe';
import './landing.css';

type SectionId = 'home' | 'about' | 'team';

const CREATORS = {
  sahil: {
    name: 'Sahil Desai',
    role: 'Co-founder and CEO',
    img: '/c1.jpeg',
    bio: 'A visionary focused on building performance-driven athlete ecosystems.',
  },
  mann: {
    name: 'Mann Agarwal',
    role: 'Co-founder and COO',
    img: '/c2.jpeg',
    bio: 'Drives tournament systems, rankings and long-term growth strategy.',
  },
} as const;

type Creator = (typeof CREATORS)[keyof typeof CREATORS];

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState<SectionId>('home');
  const [expandedCreator, setExpandedCreator] = useState<Creator | null>(null);
  const showWipe = useIntro();
  const [wipeActive, setWipeActive] = useState(showWipe);
  // Defer the 1.8MB background video until the About section is near view — the
  // poster (40KB WebP) shows until then, so nothing loads on first paint.
  const [videoSrc, setVideoSrc] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setWipeActive(false), 1200);
    return () => clearTimeout(t);
  }, []);

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
    const hash = location.hash.replace('#', '');
    if (!hash) return;
    const target = document.getElementById(hash);
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.hash]);

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

  // Lazy-load the About video only when its section is ~one screen away. Falls
  // back to loading immediately where IntersectionObserver isn't available.
  useEffect(() => {
    if (videoSrc) return;
    if (!aboutRef.current || !('IntersectionObserver' in window)) { setVideoSrc('/about.mp4'); return; }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVideoSrc('/about.mp4'); observer.disconnect(); } },
      { rootMargin: '600px 0px' },
    );
    observer.observe(aboutRef.current);
    return () => observer.disconnect();
  }, [videoSrc]);

  useEffect(() => {
    const el = teamRef.current;
    if (!el) return;
    // No IntersectionObserver → reveal immediately rather than leave the founders
    // block stuck at opacity 0.
    if (!('IntersectionObserver' in window)) { el.classList.add('visible'); return; }
    const observer = new IntersectionObserver(
      ([entry]) => {
        // A low threshold so a section taller than the viewport still reveals.
        if (entry.isIntersecting) { el.classList.add('visible'); observer.disconnect(); }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    // Safety net: if the observer somehow never fires, reveal after a beat so the
    // section can never be permanently invisible.
    const failsafe = window.setTimeout(() => el.classList.add('visible'), 2500);
    return () => { observer.disconnect(); window.clearTimeout(failsafe); };
  }, []);


  useEffect(() => {
    const menu = navTrackRef.current;
    if (!menu) return;

    const positionIndicator = () => {
      const activeItem = menu.querySelector<HTMLButtonElement>(`button[data-id="${active}"]`);
      const indicator = menu.querySelector<HTMLSpanElement>('.nav-indicator');
      if (!activeItem || !indicator) return;
      const menuRect = menu.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      indicator.style.width = `${itemRect.width}px`;
      indicator.style.left = `${itemRect.left - menuRect.left}px`;
    };

    positionIndicator();
    window.addEventListener('resize', positionIndicator);
    window.addEventListener('orientationchange', positionIndicator);
    return () => {
      window.removeEventListener('resize', positionIndicator);
      window.removeEventListener('orientationchange', positionIndicator);
    };
  }, [active]);

  const jumpTo = (id: SectionId) => {
    const nodes: Record<SectionId, HTMLElement | null> = {
      home: homeRef.current,
      about: aboutRef.current,
      team: teamRef.current,
    };
    nodes[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const moveSpotlightTo = (clientX: number, clientY: number, pointerType: string) => {
    if (pointerType === 'touch') return;
    if (!spotlightRef.current || !teamRef.current) return;
    const rect = teamRef.current.getBoundingClientRect();
    spotlightRef.current.style.left = `${clientX - rect.left}px`;
    spotlightRef.current.style.top = `${clientY - rect.top}px`;
  };

  return (
    <div className={`landing-root landing-enter ${showWipe ? 'intro-full' : 'intro-quick'}`}>
      {wipeActive && (
        <>
          <div className="page-wipe page-wipe--back" aria-hidden />
          <div className="page-wipe page-wipe--front" aria-hidden />
        </>
      )}
      <LandingHeader />

      <section id="home" className="hero-wrapper" ref={homeRef}>
        <div className="hero-photo" aria-hidden />
        <div className="hero-scrim" aria-hidden />
        <div className="hero-content">
          <span className="hero-eyebrow">India&apos;s verified sports network</span>
          <h1>
            The next<br />big player<br />
            <span className="hero-accent">could be you.</span>
          </h1>
          <p>
            Build a <b>verified profile</b> from your real match stats. Get discovered by
            scouts and coaches on <b>merit, not connections.</b>
          </p>
          <div className="hero-buttons">
            <button className="btn-primary" onClick={() => navigate('/register')}>
              Create your free profile
            </button>
            <button className="btn-glass" onClick={() => navigate('/how-it-works')}>
              See how it works
            </button>
          </div>
          <p className="hero-login">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </section>

      <section id="about" className="about-section" ref={aboutRef}>
        <video
          src={videoSrc || undefined}
          className="about-video"
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          poster="/landing/landing-bg.webp"
          aria-hidden
        />
        <div className="about-split">
          <div className="about-text">
            <h2>What Is All For One?</h2>
            <p>
              The professional network for the entire Indian sports ecosystem — where
              athletes are known by verified performance, not self-reported hype. Stats
              and rankings are recorded at real tournaments and published to a profile
              scouts, coaches and academies can trust.
            </p>
            <div className="about-pillars">
              <span className="about-pillar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
                Verified data
              </span>
              <span className="about-pillar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 12h8M12 8v8" /></svg>
                One platform
              </span>
              <span className="about-pillar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>
                Grassroots to pro
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="info-hub" ref={infoHubRef}>
        <div className="hub-cards">
          <FlipCard
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4h12v3a6 6 0 0 1-12 0V4Z" />
                <path d="M6 5H4a2 2 0 0 0 2 3M18 5h2a2 2 0 0 1-2 3" />
                <path d="M12 13v3M9 20h6M10 20a2 2 0 0 1 4 0" />
              </svg>
            }
            title="Tournaments That Matter"
            back="Competitive events designed to highlight real talent under pressure and reward performance."
          />
          <FlipCard
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19V5M4 19h16" />
                <path d="M8 16v-4M12 16V8M16 16v-6" />
              </svg>
            }
            title="Performance-Based Rankings"
            back="Rankings built from real match data and statistics - not opinions or popularity."
          />
          <FlipCard
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            }
            title="Clear Visibility"
            back="Players can track where they stand at city, state, and national levels."
          />
        </div>
      </section>

      <section
        id="team"
        className="who-section"
        ref={teamRef}
        onPointerDown={(event) => moveSpotlightTo(event.clientX, event.clientY, event.pointerType)}
        onPointerMove={(event) => moveSpotlightTo(event.clientX, event.clientY, event.pointerType)}
      >
        <div className="spotlight" ref={spotlightRef} />
        <div className="who-container">
          <div className="who-left">
            <h2>ABOUT ALL FOR ONE</h2>
            <p>
              All For 1 is a social network designed for the entire Indian sports ecosystem. At
              its core, athletes build verified profiles with verified stats and rankings. These
              are not self-reported numbers, but rather data recorded and published through our
              grassroots tournament and league partnerships.
            </p>
            <h3 className="who-subtitle">Building an Open Sports Community</h3>
            <p>
              Beyond athlete profiles, All For 1 connects the entire ecosystem—including athletes,
              coaches, scouts, and academies—on one platform. With a two-sided marketplace, social
              feed, team management, and messaging all built in, we view this as the infrastructure
              layer Indian sports has never had.
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
          <div className="contact-card" aria-label="Contact links">
            <a className="contact-link" href="mailto:info@allfor1.pro">
              <span className="contact-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4.5 7.5h15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="m4.9 8.2 6.5 5a1 1 0 0 0 1.2 0l6.5-5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="contact-meta">
                <span className="contact-label">Email</span>
                <span className="contact-value">info@allfor1.pro</span>
              </span>
            </a>

            <a
              className="contact-link"
              href="https://instagram.com/allfor1.sport"
              target="_blank"
              rel="noreferrer"
            >
              <span className="contact-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M7.5 3.8h9A3.7 3.7 0 0 1 20.2 7.5v9a3.7 3.7 0 0 1-3.7 3.7h-9A3.7 3.7 0 0 1 3.8 16.5v-9A3.7 3.7 0 0 1 7.5 3.8Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M17.2 6.8h.01"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="contact-meta">
                <span className="contact-label">Instagram</span>
                <span className="contact-value">allfor1.sport</span>
              </span>
            </a>

            <a
              className="contact-link"
              href="https://www.linkedin.com/company/all-for-one-sport/"
              target="_blank"
              rel="noreferrer"
            >
              <span className="contact-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6.6 10.2V19"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                  <path
                    d="M6.6 7.2h.01"
                    stroke="currentColor"
                    strokeWidth="2.9"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10.2 19v-5.1c0-1.9 1.2-3.1 3-3.1 1.6 0 2.6 1 2.8 2.3.1.5.1 1 .1 1.5V19"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10.2 10.2V19"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                  <path
                    d="M4.8 3.8h14.4a2 2 0 0 1 2 2v14.4a2 2 0 0 1-2 2H4.8a2 2 0 0 1-2-2V5.8a2 2 0 0 1 2-2Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    opacity="0.55"
                  />
                </svg>
              </span>
              <span className="contact-meta">
                <span className="contact-label">LinkedIn</span>
                <span className="contact-value">All For One Sport</span>
              </span>
            </a>
          </div>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-footer__inner">
          <div>
            <img src={logoUrl} alt="All For One" className="footer-logo" />
            <p>The verified data layer for Indian grassroots sport.</p>
          </div>
          <div className="l-footer__col">
            <h5>Product</h5>
            <button onClick={() => jumpTo('home')}>Home</button>
            <button onClick={() => jumpTo('about')}>About</button>
            <button onClick={() => jumpTo('team')}>Team</button>
            <Link to="/challenges">Challenges</Link>
            <Link to="/register">Sign Up</Link>
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
    </div>
  );
}

function FlipCard({ icon, title, back }: { icon: React.ReactNode; title: string; back: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      className={`flip-card ${flipped ? 'is-flipped' : ''}`}
      onClick={() => setFlipped((f) => !f)}
      aria-label={`${title}. Tap to ${flipped ? 'hide' : 'show'} details.`}
      aria-pressed={flipped}
    >
      <div className="flip-inner">
        <div className="flip-front">
          <div className="hub-icon" aria-hidden>{icon}</div>
          <h3>{title}</h3>
        </div>
        <div className="flip-back">
          <p>{back}</p>
        </div>
      </div>
    </button>
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

  const updateGlow = (clientX: number, clientY: number, pointerType: string) => {
    if (pointerType === 'touch') return;
    const card = cardRef.current;
    const glow = glowRef.current;
    if (!card || !glow) return;
    const rect = card.getBoundingClientRect();
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    card.style.setProperty('--tilt-x', `${x * 0.18}px`);
    card.style.setProperty('--tilt-y', `${y * 0.18}px`);
    glow.style.left = `${clientX - rect.left}px`;
    glow.style.top = `${clientY - rect.top}px`;
  };

  return (
    <button
      ref={cardRef}
      className="creator-card"
      onClick={() => onOpen(creator)}
      onPointerDown={(event) => updateGlow(event.clientX, event.clientY, event.pointerType)}
      onPointerMove={(event) => updateGlow(event.clientX, event.clientY, event.pointerType)}
      onPointerLeave={() => {
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

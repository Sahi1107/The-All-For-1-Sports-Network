import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoUrl from '../assets/logo.svg';
import logoBlueUrl from '../assets/logo-icon.svg';
import { SPORTS } from '../data/sports';
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

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type HeroSport = {
  sport: (typeof SPORTS)[number];
  fontPx: number;
  r: number;
  glow: 'lime' | 'blue';
  initialX: number;
  initialY: number;
};

function generateHeroSports(count: number, viewportW: number): HeroSport[] {
  const rngSize = makeRng(7);
  const rngPos = makeRng(11);
  const fallSpread = viewportW < 768 ? 1100 : 1700;
  return Array.from({ length: count }, (_, i): HeroSport => {
    const size = 0.7 + rngSize() * 0.7;
    const fontPx = (1.6 + size * 1.4) * 16;
    const r = fontPx * 0.42;
    const usableW = Math.max(viewportW - 2 * r, 100);
    return {
      sport: SPORTS[i % SPORTS.length],
      fontPx,
      r,
      glow: i % 2 === 0 ? 'lime' : 'blue',
      initialX: r + rngPos() * usableW,
      initialY: -80 - rngPos() * fallSpread,
    };
  });
}

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
  const spritesRef = useRef<Array<HTMLSpanElement | null>>([]);

  const heroSports = useMemo(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const count = w < 480 ? 38 : w < 768 ? 58 : 120;
    return generateHeroSports(count, w);
  }, []);

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
    const section = homeRef.current;
    if (!section) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const N = heroSports.length;
    const sprites = heroSports.map((item, i) => ({
      x: item.initialX,
      y: item.initialY,
      vx: 0,
      vy: 0,
      rot: (Math.random() - 0.5) * 24,
      vr: (Math.random() - 0.5) * 4,
      r: item.r,
      spinDir: i % 2 === 0 ? 1 : -1,
    }));

    let width = 0;
    let height = 0;
    const recompute = () => {
      const rect = section.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    };
    recompute();

    let cursor: { x: number; y: number } | null = null;
    let raf = 0;
    let active = false;
    let settleFrames = 0;

    const GRAVITY = 0.6;
    const DAMP_X = 0.94;
    const DAMP_Y = 0.99;
    const FLOOR_BOUNCE = 0.0;
    const WALL_BOUNCE = 0.5;
    const REPEL_RADIUS = 220;
    const REPEL_FORCE = 26;
    const RESTITUTION = 0.0;
    const CELL_SIZE = 84;

    const tick = () => {
      // 1. Forces (gravity + cursor repel)
      for (let i = 0; i < N; i++) {
        const s = sprites[i];
        s.vy += GRAVITY;
        if (cursor) {
          const dx = s.x - cursor.x;
          const dy = s.y - cursor.y;
          const d2 = dx * dx + dy * dy;
          const R = REPEL_RADIUS;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 0.01;
            const f = 1 - d / R;
            const impulse = f * f * REPEL_FORCE;
            s.vx += (dx / d) * impulse;
            s.vy += (dy / d) * impulse;
            s.vr += s.spinDir * 7 * f;
          }
        }
      }

      // 2. Integrate
      for (let i = 0; i < N; i++) {
        const s = sprites[i];
        s.x += s.vx;
        s.y += s.vy;
        s.rot += s.vr;
      }

      // 3. Constraints (broad-phase grid + 2 passes for stable stacks)
      for (let pass = 0; pass < 2; pass++) {
        const grid = new Map<string, number[]>();
        for (let i = 0; i < N; i++) {
          const s = sprites[i];
          const gx = Math.floor(s.x / CELL_SIZE);
          const gy = Math.floor(s.y / CELL_SIZE);
          const key = `${gx},${gy}`;
          const bucket = grid.get(key);
          if (bucket) bucket.push(i);
          else grid.set(key, [i]);
        }

        for (let i = 0; i < N; i++) {
          const a = sprites[i];
          const gx = Math.floor(a.x / CELL_SIZE);
          const gy = Math.floor(a.y / CELL_SIZE);
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const bucket = grid.get(`${gx + ox},${gy + oy}`);
              if (!bucket) continue;
              for (let k = 0; k < bucket.length; k++) {
                const j = bucket[k];
                if (j <= i) continue;
                const b = sprites[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const minD = a.r + b.r;
                const d2 = dx * dx + dy * dy;
                if (d2 < minD * minD && d2 > 0.0001) {
                  const d = Math.sqrt(d2);
                  const overlap = minD - d;
                  const nx = dx / d;
                  const ny = dy / d;
                  const correct = overlap * 0.5;
                  a.x -= nx * correct;
                  a.y -= ny * correct;
                  b.x += nx * correct;
                  b.y += ny * correct;
                  const vaN = a.vx * nx + a.vy * ny;
                  const vbN = b.vx * nx + b.vy * ny;
                  const vRel = vbN - vaN;
                  if (vRel < 0) {
                    const jImp = (-(1 + RESTITUTION) * vRel) / 2;
                    a.vx -= jImp * nx;
                    a.vy -= jImp * ny;
                    b.vx += jImp * nx;
                    b.vy += jImp * ny;
                  }
                }
              }
            }
          }
        }
        for (let i = 0; i < N; i++) {
          const s = sprites[i];
          if (s.y + s.r > height) {
            s.y = height - s.r;
            if (s.vy > 0) {
              s.vy = -s.vy * FLOOR_BOUNCE;
              s.vx *= 0.85;
            }
          }
          if (s.x - s.r < 0) {
            s.x = s.r;
            if (s.vx < 0) s.vx = -s.vx * WALL_BOUNCE;
          } else if (s.x + s.r > width) {
            s.x = width - s.r;
            if (s.vx > 0) s.vx = -s.vx * WALL_BOUNCE;
          }
        }
      }

      // 4. Damping + KE accumulator
      let totalKE = 0;
      for (let i = 0; i < N; i++) {
        const s = sprites[i];
        s.vx *= DAMP_X;
        s.vy *= DAMP_Y;
        s.vr *= 0.93;
        totalKE += s.vx * s.vx + s.vy * s.vy;
      }

      // 5. Write DOM transforms
      const nodes = spritesRef.current;
      for (let i = 0; i < N; i++) {
        const node = nodes[i];
        if (!node) continue;
        const s = sprites[i];
        node.style.transform =
          `translate3d(${(s.x - s.r).toFixed(1)}px, ${(s.y - s.r).toFixed(1)}px, 0) ` +
          `rotate(${s.rot.toFixed(1)}deg)`;
      }

      // 6. Sleep when idle
      if (!cursor && totalKE < N * 0.05) {
        settleFrames++;
        if (settleFrames > 40) {
          active = false;
          settleFrames = 0;
          return;
        }
      } else {
        settleFrames = 0;
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (active) return;
      active = true;
      settleFrames = 0;
      raf = requestAnimationFrame(tick);
    };

    const onMove = (event: MouseEvent) => {
      const rect = section.getBoundingClientRect();
      cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      start();
    };
    const onLeave = () => {
      cursor = null;
    };
    const onTouch = (event: TouchEvent) => {
      const t = event.touches[0];
      if (!t) return;
      const rect = section.getBoundingClientRect();
      cursor = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      start();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) cursor = null;
    };
    const onResize = () => {
      recompute();
      start();
    };

    section.addEventListener('mousemove', onMove);
    section.addEventListener('mouseleave', onLeave);
    section.addEventListener('touchstart', onTouch, { passive: true });
    section.addEventListener('touchmove', onTouch, { passive: true });
    section.addEventListener('touchend', onTouchEnd);
    section.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('resize', onResize);

    const visObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else {
          cancelAnimationFrame(raf);
          active = false;
        }
      },
      { threshold: 0 },
    );
    visObserver.observe(section);

    start();

    return () => {
      section.removeEventListener('mousemove', onMove);
      section.removeEventListener('mouseleave', onLeave);
      section.removeEventListener('touchstart', onTouch);
      section.removeEventListener('touchmove', onTouch);
      section.removeEventListener('touchend', onTouchEnd);
      section.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('resize', onResize);
      visObserver.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [heroSports]);

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

  const moveSpotlightTo = (clientX: number, clientY: number) => {
    if (!spotlightRef.current || !teamRef.current) return;
    const rect = teamRef.current.getBoundingClientRect();
    spotlightRef.current.style.left = `${clientX - rect.left}px`;
    spotlightRef.current.style.top = `${clientY - rect.top}px`;
  };

  return (
    <div className="landing-root">
      <header className="glass-header">
        <button className="logo" onClick={() => jumpTo('home')} aria-label="All For One home">
          <img src={navBlue ? logoBlueUrl : logoUrl} className="logo-anim" alt="All For One" />
        </button>

        <button className={`nav-signup nav-signup--corner ${navBlue ? 'nav-signup--blue' : ''}`} onClick={() => navigate('/login')}>
          Sign Up
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
        </nav>
      </header>

      <section id="home" className="hero-wrapper" ref={homeRef}>
        <div className="hero-aurora" aria-hidden />
        <div className="hero-field" aria-hidden>
          {heroSports.map((item, i) => (
            <span
              key={i}
              ref={(el) => {
                spritesRef.current[i] = el;
              }}
              className={`hero-sport hero-sport--${item.glow}`}
              style={{
                fontSize: `${item.fontPx.toFixed(1)}px`,
                transform: `translate3d(${(item.initialX - item.r).toFixed(1)}px, ${(item.initialY - item.r).toFixed(1)}px, 0)`,
              }}
            >
              {item.sport.emoji}
            </span>
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
        onPointerDown={(event) => moveSpotlightTo(event.clientX, event.clientY)}
        onPointerMove={(event) => moveSpotlightTo(event.clientX, event.clientY)}
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

  const updateGlow = (clientX: number, clientY: number) => {
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
      onPointerDown={(event) => updateGlow(event.clientX, event.clientY)}
      onPointerMove={(event) => updateGlow(event.clientX, event.clientY)}
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

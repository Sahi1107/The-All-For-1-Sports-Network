import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Trophy, BarChart3, Users, Eye, Rocket, ShieldCheck,
  Mail, MapPin, Phone,
} from 'lucide-react';
import logoUrl from '../assets/logo.svg';
import './landing.css';

type SectionId = 'home' | 'about' | 'team';
const NAV_LINKS: { id: SectionId; label: string }[] = [
  { id: 'home',  label: 'Home'  },
  { id: 'about', label: 'About' },
  { id: 'team',  label: 'Team'  },
];

/** Reveal-on-scroll: toggles `is-visible` when at least one element with
 *  the `.reveal` class enters the viewport. Runs once per element. */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

interface NavBarProps {
  active: SectionId;
  onJump: (id: SectionId) => void;
  scrolled: boolean;
}

function NavBar({ active, onJump, scrolled }: NavBarProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  useEffect(() => {
    const update = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const activeEl = menu.querySelector<HTMLButtonElement>(`button[data-id="${active}"]`);
      if (!activeEl) return;
      const menuRect = menu.getBoundingClientRect();
      const r = activeEl.getBoundingClientRect();
      setIndicator({ left: r.left - menuRect.left, width: r.width });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [active]);

  return (
    <nav className="l-nav" aria-label="Primary">
      <div className={`l-nav__bar ${scrolled ? 'l-nav__bar--scrolled' : ''}`}>
        <button
          className="l-nav__brand"
          onClick={() => onJump('home')}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label="All For One — back to top"
        >
          <span className="l-nav__brand-mark">A1</span>
          <span>All For One</span>
        </button>

        <div className="l-nav__menu" ref={menuRef}>
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              data-id={link.id}
              className="l-nav__item"
              onClick={() => onJump(link.id)}
              aria-current={active === link.id ? 'true' : undefined}
            >
              {link.label}
            </button>
          ))}
          <span
            className="l-nav__indicator"
            style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
          />
        </div>

        <div className="l-nav__cta">
          <Link to="/login" className="l-btn l-btn--ghost">Sign In</Link>
          <Link to="/login" className="l-btn l-btn--primary">
            Sign Up <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </nav>
  );
}

interface CreatorCard {
  initials: string;
  name: string;
  role: string;
  bio: string;
}
const TEAM: CreatorCard[] = [
  {
    initials: 'AV',
    name: 'Aarav Mehta',
    role: 'Founder · Vision',
    bio: 'A visionary focused on building performance-driven athlete ecosystems.',
  },
  {
    initials: 'SD',
    name: 'Sahil Desai',
    role: 'Product · Engineering',
    bio: 'Drives the product surface, performance, and end-to-end athlete experience.',
  },
  {
    initials: 'RK',
    name: 'Riya Kapoor',
    role: 'Tournaments · Growth',
    bio: 'Drives tournament systems, rankings and long-term growth strategy.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<SectionId>('home');

  const homeRef  = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);
  const teamRef  = useRef<HTMLElement>(null);

  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-spy: highlight nav item for the section currently in view
  useEffect(() => {
    const targets = [
      [homeRef.current,  'home'  as const],
      [aboutRef.current, 'about' as const],
      [teamRef.current,  'team'  as const],
    ].filter((t): t is [HTMLElement, SectionId] => t[0] !== null);

    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = targets.find(([el]) => el === entry.target)?.[1];
            if (id) setActive(id);
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    targets.forEach(([el]) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jumpTo = (id: SectionId) => {
    const refMap: Record<SectionId, React.RefObject<HTMLElement | null>> = {
      home: homeRef, about: aboutRef, team: teamRef,
    };
    const node = refMap[id].current;
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  // Animated live counter (decorative)
  const [liveCount, setLiveCount] = useState(2143);
  useEffect(() => {
    const id = setInterval(() => {
      setLiveCount((c) => c + Math.floor(Math.random() * 3));
    }, 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="landing-root">
      <NavBar active={active} onJump={jumpTo} scrolled={scrolled} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section ref={homeRef} id="home" className="l-hero">
        <div className="l-hero__bg" aria-hidden />
        <div className="l-hero__orbs" aria-hidden>
          <span className="l-hero__orb l-hero__orb--a" />
          <span className="l-hero__orb l-hero__orb--b" />
          <span className="l-hero__orb l-hero__orb--c" />
        </div>

        <div className="l-hero__eyebrow">
          <span className="dot" />
          The Network for the Sports Ecosystem
        </div>

        <h1 className="l-hero__title">
          Performance is the Test.<br />
          <em>Elite</em> is the Title.
        </h1>

        <p className="l-hero__sub">
          All For One runs performance-driven tournaments where athletes earn recognition
          through real results. Track rankings, register for events, and connect with the
          people building the next era of sport.
        </p>

        <div className="l-hero__buttons">
          <button className="l-btn l-btn--primary" onClick={() => navigate('/login')}>
            Sign Up &mdash; It&apos;s Free <ArrowRight size={18} />
          </button>
          <button className="l-btn l-btn--outline" onClick={() => jumpTo('about')}>
            Learn More
          </button>
        </div>

        <div className="l-hero__counter" aria-live="polite">
          <span className="live-pulse" />
          <span><strong>{liveCount.toLocaleString()}</strong> athletes ranked this season</span>
        </div>

        <div className="l-hero__scroll" aria-hidden>
          <span>Scroll</span>
          <span className="l-hero__scroll-line" />
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────────────── */}
      <section ref={aboutRef} id="about" className="l-about">
        <div className="l-about__inner reveal reveal--scale">
          <span className="l-section__eyebrow">About All For One</span>
          <h2 className="l-section__title">Building an Open Sports Community</h2>
          <p className="l-section__subtitle">
            We create real opportunities for athletes to prove themselves through tournaments
            and rankings &mdash; transparent, performance-based, and built for the next generation
            of competitors, coaches, scouts and clubs.
          </p>
        </div>
      </section>

      {/* ── Tournaments feature ─────────────────────────────────────── */}
      <section className="l-feature">
        <div className="l-feature__inner reveal">
          <div className="l-feature__copy">
            <span className="l-section__eyebrow" style={{ color: '#2929db' }}>What We Offer</span>
            <h2>Tournaments That Matter</h2>
            <p>
              Competitive events designed to highlight real talent under pressure and
              reward performance. Every match feeds verified data into the rankings &mdash;
              no politics, just play.
            </p>
            <div className="l-feature__list">
              <div className="l-feature__list-item">
                <span className="check">&#10003;</span>
                Open registration across cities, states, and national circuits
              </div>
              <div className="l-feature__list-item">
                <span className="check">&#10003;</span>
                Live scoring and verified match results
              </div>
              <div className="l-feature__list-item">
                <span className="check">&#10003;</span>
                Performance feeds directly into ranking algorithms
              </div>
            </div>
          </div>
          <div
            className="l-feature__visual"
            style={{ backgroundImage: 'url(/landing/tournament-lines.png)' } as CSSProperties}
            aria-hidden
          />
        </div>
      </section>

      {/* ── Performance feature ──────────────────────────────────────── */}
      <section className="l-feature l-feature--alt">
        <div className="l-feature__inner l-feature__inner--reverse reveal">
          <div
            className="l-feature__visual l-feature__visual--mirror"
            style={{ backgroundImage: 'url(/landing/performance-lines.png)' } as CSSProperties}
            aria-hidden
          />
          <div className="l-feature__copy">
            <span className="l-section__eyebrow" style={{ color: '#2929db' }}>Performance-Based Rankings</span>
            <h2>How Rankings Work</h2>
            <p>
              Each stat is normalized so players are evaluated relative to realistic
              performance ceilings rather than raw totals alone. Position, efficiency,
              and consistency all factor in &mdash; volume alone won&apos;t inflate a rank.
            </p>
            <div className="l-feature__list">
              <div className="l-feature__list-item">
                <span className="check">&#10003;</span>
                Position-aware weighting across every sport
              </div>
              <div className="l-feature__list-item">
                <span className="check">&#10003;</span>
                Efficiency adjustment prevents volume gaming
              </div>
              <div className="l-feature__list-item">
                <span className="check">&#10003;</span>
                Track standings at city, state, and national level
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Info hub flip cards ──────────────────────────────────────── */}
      <section className="l-hub">
        <div className="l-hub__head reveal">
          <h2>What Is All For One?</h2>
          <p>A network built for athletes &mdash; with the tools, visibility, and credibility you actually need.</p>
        </div>

        <div className="l-hub__grid">
          {[
            { icon: <Trophy size={24} />,     title: 'Tournaments',          back: 'Real, performance-driven events with verified scoring.' },
            { icon: <BarChart3 size={24} />,  title: 'Rankings',             back: 'Transparent, position-aware leaderboards across India.' },
            { icon: <Eye size={24} />,        title: 'Clear Visibility',     back: 'Coaches, scouts and clubs can find you on merit.' },
            { icon: <Users size={24} />,      title: 'Community',            back: 'Connect with athletes, coaches and teams who care.' },
            { icon: <Rocket size={24} />,     title: 'Grow Your Career',     back: 'Build a profile that travels with you across seasons.' },
            { icon: <ShieldCheck size={24} />, title: 'Verified Profiles',   back: 'Every athlete and result is verified before it counts.' },
          ].map((c, i) => (
            <div key={i} className="l-flip reveal" style={{ transitionDelay: `${i * 60}ms` } as CSSProperties}>
              <div className="l-flip__inner">
                <div className="l-flip__face">
                  <div className="l-flip__icon">{c.icon}</div>
                  <h3>{c.title}</h3>
                </div>
                <div className="l-flip__face l-flip__face--back">
                  <p>{c.back}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Team ─────────────────────────────────────────────────────── */}
      <section ref={teamRef} id="team" className="l-team">
        <div className="l-team__head reveal">
          <span className="l-section__eyebrow">Meet The Creators</span>
          <h2>Built by Athletes &amp; Builders</h2>
          <p>The small team behind the platform &mdash; obsessed with putting performance back at the center of sport.</p>
        </div>

        <div className="l-team__grid">
          {TEAM.map((t, i) => (
            <div key={t.name} className="l-team__card reveal" style={{ transitionDelay: `${i * 100}ms` } as CSSProperties}>
              <div className="l-team__card-inner">
                <div className="l-team__avatar">{t.initials}</div>
                <div className="l-team__card-body">
                  <h3>{t.name}</h3>
                  <span>{t.role}</span>
                  <p>{t.bio}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────────── */}
      <section className="l-contact">
        <div className="l-contact__inner">
          <div className="l-contact__copy reveal">
            <span className="l-section__eyebrow">Contact Us</span>
            <h2>Ready to be ranked?</h2>
            <p>
              Drop us a note &mdash; whether you&apos;re an athlete, a club, a tournament
              organizer, or a brand interested in partnering with All For One.
            </p>

            <div className="l-contact__info">
              <div className="l-contact__info-item">
                <span><Mail size={12} style={{ display: 'inline', marginRight: 6 }} /> Email</span>
                <p>hello@allfor1.network</p>
              </div>
              <div className="l-contact__info-item">
                <span><Phone size={12} style={{ display: 'inline', marginRight: 6 }} /> Phone</span>
                <p>+91 00000 00000</p>
              </div>
              <div className="l-contact__info-item">
                <span><MapPin size={12} style={{ display: 'inline', marginRight: 6 }} /> Location</span>
                <p>India</p>
              </div>
            </div>
          </div>

          <form
            className="l-contact__form reveal reveal--scale"
            onSubmit={(e) => {
              e.preventDefault();
              navigate('/login');
            }}
          >
            <label>Your Name</label>
            <input type="text" required placeholder="Aarav Mehta" />
            <label>Email Address</label>
            <input type="email" required placeholder="you@allfor1.network" />
            <label>Your Message</label>
            <textarea required placeholder="Tell us a bit about yourself…" />
            <button type="submit" className="l-btn l-btn--primary">
              Send Message <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="l-footer">
        <div className="l-footer__inner">
          <div className="l-footer__brand">
            <img src={logoUrl} alt="All For 1" style={{ height: 60, marginBottom: 12 }} />
            <h4>All For One</h4>
            <p>The network for the sports ecosystem &mdash; tournaments, rankings, and a real path forward for athletes.</p>
          </div>

          <div className="l-footer__col">
            <h5>Product</h5>
            <button onClick={() => jumpTo('home')}>Home</button>
            <button onClick={() => jumpTo('about')}>About</button>
            <button onClick={() => jumpTo('team')}>Team</button>
            <Link to="/login">Sign In</Link>
            <Link to="/login">Sign Up</Link>
          </div>

          <div className="l-footer__col">
            <h5>Legal</h5>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </div>
        </div>

        <div className="l-footer__bar">
          <span>&copy; {new Date().getFullYear()} All For One Network. All rights reserved.</span>
          <span>
            <Link to="/terms" style={{ color: 'inherit', marginRight: 16 }}>Terms</Link>
            <Link to="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

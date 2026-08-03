import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { track } from '../config/analytics';
import { Sparkles, BadgeCheck, Trophy, Zap, Search, CheckCircle2, X } from 'lucide-react';

const tourKey = (id: string) => `af1:tour-seen:${id}`;
const MAX_ACCOUNT_AGE_DAYS = 14; // only greet genuinely new accounts

interface Step {
  Icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}

/** Role-aware steps: athletes → build + compete; scouts/coaches → discover. */
function stepsFor(role: string): Step[] {
  const welcome: Step = { Icon: Sparkles, title: 'Welcome to All For 1', body: 'The verified network for grassroots sport. A quick tour of what to do next — you can skip anytime.' };
  const done: Step = { Icon: CheckCircle2, title: "You're all set", body: 'That’s it. Explore, connect, and make your mark.' };

  if (role === 'COACH' || role === 'SCOUT' || role === 'AGENT') {
    return [
      welcome,
      { Icon: Zap, title: 'Discover talent with Radar', body: 'Find athletes that match what you need — by sport, position, location and verified stats.', cta: { label: 'Open Radar', to: '/radar' } },
      { Icon: Search, title: 'Search & explore', body: 'Jump to any athlete, team or tournament from the search icon in the top bar or side rail.', cta: { label: 'Explore', to: '/explore' } },
      done,
    ];
  }
  return [
    welcome,
    { Icon: BadgeCheck, title: 'Build your verified profile', body: 'Add your bio, position, stats and highlights. A complete, verified profile gets you discovered by scouts and coaches.', cta: { label: 'Edit profile', to: '/profile/edit' } },
    { Icon: Trophy, title: 'Join tournaments', body: 'Browse tournaments, register your team, and track your performances as they happen.', cta: { label: 'Browse tournaments', to: '/tournaments' } },
    done,
  ];
}

/**
 * Light, skippable first-run tour. Shows once (localStorage per user) and only
 * for genuinely new accounts, so established users aren't nagged. Role-aware.
 */
export default function ProductTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem(tourKey(user.id))) return;
    // Staff run the platform — they never need the member onboarding tour.
    if (user.role === 'ADMIN' || user.role === 'ORGANIZER') {
      try { localStorage.setItem(tourKey(user.id), '1'); } catch { /* private mode */ }
      return;
    }
    const fresh = !user.createdAt || Date.now() - new Date(user.createdAt).getTime() < MAX_ACCOUNT_AGE_DAYS * 86_400_000;
    if (fresh) {
      setStep(0); setShow(true); track('tour_started', { role: user.role });
      // Mark seen the moment it's SHOWN, not only on dismissal — an ignored tour
      // must not re-open on every reload and follow the user page to page.
      try { localStorage.setItem(tourKey(user.id), '1'); } catch { /* private mode */ }
    }
    else { try { localStorage.setItem(tourKey(user.id), '1'); } catch { /* private mode */ } } // silently mark old accounts
  }, [user]);

  const dismiss = (how: 'completed' | 'skipped') => {
    if (user) { try { localStorage.setItem(tourKey(user.id), '1'); } catch { /* noop */ } }
    track(`tour_${how}`, { step });
    setShow(false);
  };

  if (!show || !user) return null;
  const steps = stepsFor(user.role);
  const s = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => dismiss('skipped')} />
      <div className="relative w-full sm:max-w-md bg-card border border-line rounded-t-3xl sm:rounded-2xl overflow-hidden af-fade-in"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button onClick={() => dismiss('skipped')} aria-label="Skip tour"
          className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full flex items-center justify-center text-gray-custom hover:text-foreground hover:bg-ink/10 transition-colors">
          <X size={17} />
        </button>

        <div className="px-6 pt-9 pb-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mb-4">
            <s.Icon size={26} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold">{s.title}</h2>
          <p className="text-sm text-gray-custom mt-2 max-w-xs mx-auto leading-relaxed">{s.body}</p>

          {s.cta && (
            <button
              onClick={() => { const to = s.cta!.to; dismiss('completed'); navigate(to); }}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary font-semibold text-sm rounded-xl hover:bg-primary-dark transition-colors"
            >
              {s.cta.label}
            </button>
          )}
        </div>

        {/* Progress + controls */}
        <div className="px-6 py-4 border-t border-line flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-primary' : 'w-1.5 bg-ink/20'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && !isLast && (
              <button onClick={() => setStep((n) => n - 1)} className="px-3 py-1.5 text-sm text-gray-custom hover:text-foreground transition-colors">Back</button>
            )}
            {isLast ? (
              <button onClick={() => dismiss('completed')} className="px-4 py-1.5 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">Get started</button>
            ) : (
              <>
                <button onClick={() => dismiss('skipped')} className="px-3 py-1.5 text-sm text-gray-custom hover:text-foreground transition-colors">Skip</button>
                <button onClick={() => setStep((n) => n + 1)} className="px-4 py-1.5 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">Next</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useLogo } from '../hooks/useLogo';
import { Mail, ChevronLeft, ChevronRight } from 'lucide-react';
import { COUNTRY_LIST, getStates, HEIGHT_OPTIONS } from '../data/locationData';
import { SPORTS, ATHLETICS_EVENT_GROUPS, type Sport } from '../data/sports';

// Lazy so the long legal text only loads when a signup link is tapped, and
// stays a separate chunk (consistent with the app's lazy-loaded legal pages).
const LegalModal = lazy(() => import('../components/LegalModal'));

const ROLES = [
  { value: 'ATHLETE', label: 'Athlete',                 desc: 'Showcase your skills & compete' },
  { value: 'COACH',   label: 'Coach',                   desc: 'Discover & develop talent' },
  { value: 'SCOUT',   label: 'Scout',                   desc: 'Find the next big star' },
  { value: 'TEAM',    label: 'Team / Academy',          desc: 'Represent your club or academy' },
  { value: 'AGENT',   label: 'Agent / Talent Manager',  desc: 'Represent and manage athletes' },
  { value: 'MEDIA',   label: 'Media',                   desc: 'Cover athletes & events' },
] as const;

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function DOBPicker({ value, onChange }: { value: Date | null; onChange: (d: Date) => void }) {
  const today = new Date();
  const maxDate = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());
  const minYear = today.getFullYear() - 100;

  const startYear = value ? value.getFullYear() : maxDate.getFullYear();
  const startMonth = value ? value.getMonth() : maxDate.getMonth();

  const [viewYear, setViewYear]   = useState(startYear);
  const [viewMonth, setViewMonth] = useState(startMonth);

  const years = Array.from({ length: 91 }, (_, i) => maxDate.getFullYear() - i);
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const isDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    return d > maxDate || d.getFullYear() < minYear;
  };

  const isSelected = (day: number) =>
    !!value &&
    value.getFullYear() === viewYear &&
    value.getMonth()    === viewMonth &&
    value.getDate()     === day;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
    const nm = viewMonth === 11 ? 0 : viewMonth + 1;
    if (ny > maxDate.getFullYear() || (ny === maxDate.getFullYear() && nm > maxDate.getMonth())) return;
    setViewYear(ny); setViewMonth(nm);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-surface rounded-xl border border-line p-4 select-none">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button type="button" onClick={prevMonth}
          className="p-1.5 hover:bg-ink/10 rounded-lg text-gray-custom hover:text-foreground transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))}
            className="bg-elevated text-foreground text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary border border-line">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))}
            className="bg-elevated text-foreground text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary border border-line">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button type="button" onClick={nextMonth}
          className="p-1.5 hover:bg-ink/10 rounded-lg text-gray-custom hover:text-foreground transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs text-gray-custom py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) =>
          day === null ? <div key={`e-${i}`} /> : (
            <button key={day} type="button" disabled={isDisabled(day)}
              onClick={() => { if (!isDisabled(day)) onChange(new Date(viewYear, viewMonth, day)); }}
              className={`aspect-square text-xs rounded-full flex items-center justify-center transition-colors mx-auto w-7 h-7
                ${isSelected(day)
                  ? 'bg-primary text-on-primary font-bold'
                  : isDisabled(day)
                  ? 'text-foreground/20 cursor-not-allowed'
                  : 'hover:bg-ink/10 text-foreground'
                }`}
            >
              {day}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default function Register() {
  const logoUrl = useLogo();
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    role:  '' as 'ATHLETE' | 'COACH' | 'SCOUT' | 'TEAM' | 'AGENT' | 'MEDIA' | '',
    sport: '' as Sport | '',
    gender: '' as 'MALE' | 'FEMALE' | '',
    athleticsEvents: [] as string[],
    country: '',
    state: '',
    city: '',
    height: '',
  });
  const [dob, setDob]         = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);

  const isTeam = form.role === 'TEAM';
  const [athleticsSubStep, setAthleticsSubStep] = useState(false);
  const requiresAthleticsEvents = form.sport === 'ATHLETICS';

  const ageFrom = (d: Date) => {
    const today = new Date();
    let a = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
    return a;
  };
  // Athletes under 13 must be managed by a parent/academy.
  const isUnder13Athlete = form.role === 'ATHLETE' && !!dob && ageFrom(dob) < 13;

  const states = form.country ? getStates(form.country) : [];
  const location = form.country
    ? form.state
      ? form.city.trim() ? `${form.city.trim()}, ${form.state}, ${form.country}` : `${form.state}, ${form.country}`
      : form.country
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.role || !form.sport) return;
    if (!isTeam && !dob) return;
    if (!isTeam && !form.gender) { toast.error('Please select your gender'); return; }
    if (!termsAccepted) { toast.error('Please accept the Terms and Privacy Policy to continue'); return; }
    setLoading(true);
    try {
      const age = !isTeam && dob ? ageFrom(dob) : undefined;

      await register({
        name: form.name, email: form.email, password: form.password,
        role: form.role, sport: form.sport,
        ...(!isTeam && form.gender && { gender: form.gender }),
        ...(requiresAthleticsEvents && { athleticsEvents: form.athleticsEvents }),
        ...(age !== undefined && { age }),
        ...(!isTeam && dob && { dateOfBirth: dob.toISOString() }),
        location: location || undefined,
        height: isTeam ? undefined : (form.height || undefined),
      });
      setDone(true);
    } catch (err: any) {
      const code = err.code ?? '';
      if (code === 'auth/email-already-in-use') toast.error('An account with that email already exists.');
      else if (code === 'auth/weak-password')   toast.error('Password is too weak.');
      else toast.error(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const canAdvanceStep1 =
    form.name.trim() && form.email.trim() && PASSWORD_REGEX.test(form.password);

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="w-full max-w-md text-center">
          <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-8" />
          <div className="bg-card rounded-2xl p-8 border border-line">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Check your email</h2>
            <p className="text-gray-custom text-sm mb-3">
              {isUnder13Athlete
                ? <>We sent a verification link to the parent/academy email{' '}
                    <span className="text-foreground font-medium">{form.email}</span>.
                    The parent or academy should click it to activate this account.</>
                : <>We sent a verification link to{' '}
                    <span className="text-foreground font-medium">{form.email}</span>.
                    Click it to activate your account.</>}
            </p>
            <p className="text-yellow-400/80 text-xs mb-6">
              Can't find it? Check your <span className="font-semibold">spam or junk folder</span>.
            </p>
            <Link to="/login" className="block w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors">
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-4" />
          <p className="text-gray-custom">Join the network</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-8 border border-line">
          {/* Progress bar — 5 steps for individuals, 4 for team/academy */}
          {(() => {
            const totalSteps = isTeam ? 4 : 5;
            const visibleStep = isTeam && step >= 3 ? step - 1 : step;
            return (
              <div className="flex gap-2 mb-6">
                {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
                  <div key={s} className={`flex-1 h-1 rounded-full ${s <= visibleStep ? 'bg-primary' : 'bg-elevated'}`} />
                ))}
              </div>
            );
          })()}

          {/* Step 1: Role */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">I am a...</h2>
              <div className="space-y-3">
                {ROLES.map(({ value, label, desc }) => (
                  <button key={value} type="button"
                    onClick={() => { setForm({ ...form, role: value }); setStep(2); }}
                    className={`w-full p-4 rounded-lg border text-left transition-colors ${
                      form.role === value ? 'border-primary bg-primary/10' : 'border-line hover:border-gray-custom'
                    }`}>
                    <p className="font-medium">{label}</p>
                    <p className="text-sm text-gray-custom">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Basic info */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Create Account</h2>
              <div>
                <label className="block text-sm text-gray-custom mb-2">{isTeam ? 'Team Name' : 'Full Name'}</label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground"
                  placeholder={isTeam ? 'Your team or academy name' : 'Your full name'}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-custom mb-2">Email</label>
                <input type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-custom mb-2">Password</label>
                <input type="password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground"
                  placeholder="Min 8 chars, upper + lower + number"
                />
                {form.password && !PASSWORD_REGEX.test(form.password) && (
                  <p className="text-xs text-red-400 mt-1">
                    Must be 8+ characters with uppercase, lowercase, and a number.
                  </p>
                )}
              </div>
              <button type="button" onClick={() => { if (canAdvanceStep1) setStep(isTeam ? 4 : 3); }}
                disabled={!canAdvanceStep1}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50">
                Continue
              </button>
              <button type="button" onClick={() => setStep(1)}
                className="w-full py-2 text-gray-custom hover:text-foreground transition-colors">Back</button>
            </div>
          )}

          {/* Step 3: Date of Birth — skipped for TEAM */}
          {step === 3 && !isTeam && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Date of Birth</h2>
                <p className="text-sm text-gray-custom mt-1">This cannot be changed later.</p>
              </div>
              <DOBPicker value={dob} onChange={setDob} />
              {dob && (
                <p className="text-sm text-center text-foreground/70">
                  Selected: <span className="text-foreground font-medium">
                    {dob.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </p>
              )}

              {/* Parental guidance — athletes under 13 are managed by a parent/academy */}
              {isUnder13Athlete && (
                <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/5 p-4 space-y-3">
                  <p className="text-sm text-yellow-300/90">
                    Athletes under 13 must be managed by a parent or academy. The email and password
                    you entered will belong to the <span className="font-semibold">parent or academy</span>,
                    and the verification link will be sent to that email. Once the athlete turns 13, you
                    can hand over the account to them from Settings.
                  </p>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={guardianConsent}
                      onChange={(e) => setGuardianConsent(e.target.checked)}
                      className="mt-0.5 accent-primary w-4 h-4 shrink-0" />
                    <span className="text-sm text-foreground/80">
                      I am the parent, guardian, or academy (or have their consent), and the email and
                      password provided belong to them.
                    </span>
                  </label>
                </div>
              )}

              <button type="button" onClick={() => { if (dob) setStep(4); }}
                disabled={!dob || (isUnder13Athlete && !guardianConsent)}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50">
                Continue
              </button>
              <button type="button" onClick={() => setStep(2)}
                className="w-full py-2 text-gray-custom hover:text-foreground transition-colors">Back</button>
            </div>
          )}

          {/* Step 4: Sport */}
          {step === 4 && !athleticsSubStep && (
            <div>
              <h2 className="text-xl font-semibold mb-4">{isTeam ? 'Primary sport' : 'My sport'}</h2>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {SPORTS.map(({ value, label, emoji }) => (
                  <button key={value} type="button"
                    onClick={() => {
                      const next = { ...form, sport: value, athleticsEvents: [] as string[] };
                      setForm(next);
                      if (value === 'ATHLETICS') {
                        setAthleticsSubStep(true);
                      } else {
                        setStep(5);
                      }
                    }}
                    className={`w-full p-4 rounded-lg border text-left transition-colors flex items-center gap-3 ${
                      form.sport === value ? 'border-primary bg-primary/10' : 'border-line hover:border-gray-custom'
                    }`}>
                    <span className="text-2xl">{emoji}</span>
                    <span className="font-medium">{label}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setStep(isTeam ? 2 : 3)}
                className="w-full mt-4 py-2 text-gray-custom hover:text-foreground transition-colors">Back</button>
            </div>
          )}

          {/* Step 4b: Athletics events (athletes only) */}
          {step === 4 && athleticsSubStep && (
            <div>
              <h2 className="text-xl font-semibold mb-1">My events</h2>
              <p className="text-sm text-gray-custom mb-4">Select one or more events you compete in.</p>
              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                {ATHLETICS_EVENT_GROUPS.map(({ label, events }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-custom mb-2">{label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {events.map((event) => {
                        const selected = form.athleticsEvents.includes(event);
                        return (
                          <button key={event} type="button"
                            onClick={() => {
                              setForm({
                                ...form,
                                athleticsEvents: selected
                                  ? form.athleticsEvents.filter((e) => e !== event)
                                  : [...form.athleticsEvents, event],
                              });
                            }}
                            className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                              selected ? 'border-primary bg-primary/10 text-foreground' : 'border-line text-gray-custom hover:border-gray-custom'
                            }`}>
                            {event}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button"
                onClick={() => { if (form.athleticsEvents.length > 0) { setAthleticsSubStep(false); setStep(5); } }}
                disabled={form.athleticsEvents.length === 0}
                className="w-full mt-4 py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50">
                Continue
              </button>
              <button type="button"
                onClick={() => { setAthleticsSubStep(false); setForm({ ...form, sport: '', athleticsEvents: [] }); }}
                className="w-full py-2 text-gray-custom hover:text-foreground transition-colors">Back</button>
            </div>
          )}

          {/* Step 5: Location (+ Height for individuals) */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{isTeam ? 'Location' : 'Location & Height'}</h2>
                <p className="text-sm text-gray-custom mt-1">Optional — you can skip this step.</p>
              </div>

              {/* Country */}
              <div>
                <label className="block text-sm text-gray-custom mb-2">Country</label>
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value, state: '', city: '' })}
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground"
                >
                  <option value="">Select country</option>
                  {COUNTRY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* State — shown once country is selected */}
              {form.country && states.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-custom mb-2">State / Province</label>
                  <select
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value, city: '' })}
                    className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground"
                  >
                    <option value="">Select state</option>
                    {states.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* City — free text input */}
              {form.state && (
                <div>
                  <label className="block text-sm text-gray-custom mb-2">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Enter your city"
                    className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom"
                  />
                </div>
              )}

              {/* Gender — required for individuals; keeps men's and women's rankings separate */}
              {!isTeam && (
                <div>
                  <label className="block text-sm text-gray-custom mb-2">
                    Gender <span className="text-primary">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(form.role === 'ATHLETE'
                      ? [['MALE', "Men's"], ['FEMALE', "Women's"]]
                      : [['MALE', 'Male'], ['FEMALE', 'Female']]
                    ).map(([value, label]) => (
                      <button key={value} type="button"
                        onClick={() => setForm({ ...form, gender: value as 'MALE' | 'FEMALE' })}
                        className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                          form.gender === value ? 'border-primary bg-primary/10 text-foreground' : 'border-line text-gray-custom hover:border-gray-custom'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Height — individuals only */}
              {!isTeam && (
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Height</label>
                  <select
                    value={form.height}
                    onChange={(e) => setForm({ ...form, height: e.target.value })}
                    className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground"
                  >
                    <option value="">Select height</option>
                    {HEIGHT_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                  </select>
                </div>
              )}

              {/* Terms / EULA acceptance — required for everyone. The zero-tolerance
                  line is an App Store 1.2 requirement for user-generated content. */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 accent-primary w-4 h-4 shrink-0" />
                <span className="text-sm text-foreground/80">
                  I agree to the{' '}
                  <button type="button"
                    onClick={(e) => { e.preventDefault(); setLegalDoc('terms'); }}
                    className="text-primary hover:text-primary-light underline">Terms &amp; Conditions</button>{' '}
                  and{' '}
                  <button type="button"
                    onClick={(e) => { e.preventDefault(); setLegalDoc('privacy'); }}
                    className="text-primary hover:text-primary-light underline">Privacy Policy</button>.
                  I understand there is <span className="font-semibold">zero tolerance for objectionable
                  content or abusive behavior</span>, and that such content and users may be removed.
                </span>
              </label>

              <button type="submit" disabled={loading || !termsAccepted || (!isTeam && !form.gender)}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50">
                {loading ? 'Creating account…' : 'Join All For 1'}
              </button>
              <button type="button" onClick={() => setStep(4)}
                className="w-full py-2 text-gray-custom hover:text-foreground transition-colors">Back</button>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-gray-custom">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary-light">Sign In</Link>
          </p>
        </form>
      </div>

      {legalDoc && (
        <Suspense fallback={null}>
          <LegalModal docType={legalDoc} onClose={() => setLegalDoc(null)} />
        </Suspense>
      )}
    </div>
  );
}

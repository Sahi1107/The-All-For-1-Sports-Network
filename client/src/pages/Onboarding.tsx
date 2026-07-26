import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useLogo } from '../hooks/useLogo';
import { COUNTRY_LIST, getStates, HEIGHT_OPTIONS } from '../data/locationData';
import { SPORTS, ATHLETICS_EVENT_GROUPS, type Sport } from '../data/sports';
import DOBPicker from '../components/DOBPicker';

const LegalModal = lazy(() => import('../components/LegalModal'));

const ROLES = [
  { value: 'ATHLETE', label: 'Athlete',                 desc: 'Showcase your skills & compete' },
  { value: 'COACH',   label: 'Coach',                   desc: 'Discover & develop talent' },
  { value: 'SCOUT',   label: 'Scout',                   desc: 'Find the next big star' },
  { value: 'TEAM',    label: 'Team / Academy',          desc: 'Represent your club or academy' },
  { value: 'AGENT',   label: 'Agent / Talent Manager',  desc: 'Represent and manage athletes' },
  { value: 'MEDIA',   label: 'Media',                   desc: 'Cover athletes & events' },
] as const;

/**
 * Google onboarding — "complete your profile". A Google account only gives us
 * name/email/photo, so this collects the fields signup normally requires:
 * role, date of birth (mandatory — the under-13 guardian gate depends on it),
 * sport, gender, location. On submit it POSTs the same /auth/sync as email/password
 * signup, so an under-13 athlete lands in the identical guardian-managed path.
 */
export default function Onboarding() {
  const logoUrl = useLogo();
  const { onboardingPrefill, completeGoogleOnboarding, logout } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: onboardingPrefill?.name ?? '',
    role:  '' as 'ATHLETE' | 'COACH' | 'SCOUT' | 'TEAM' | 'AGENT' | 'MEDIA' | '',
    sport: '' as Sport | '',
    gender: '' as 'MALE' | 'FEMALE' | '',
    athleticsEvents: [] as string[],
    country: '',
    state: '',
    city: '',
    height: '',
  });
  const [dob, setDob] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const [athleticsSubStep, setAthleticsSubStep] = useState(false);

  const isTeam = form.role === 'TEAM';
  const requiresAthleticsEvents = form.sport === 'ATHLETICS';

  const ageFrom = (d: Date) => {
    const today = new Date();
    let a = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
    return a;
  };
  const isUnder13Athlete = form.role === 'ATHLETE' && !!dob && ageFrom(dob) < 13;

  const states = form.country ? getStates(form.country) : [];
  const location = form.country
    ? form.state
      ? form.city.trim() ? `${form.city.trim()}, ${form.state}, ${form.country}` : `${form.state}, ${form.country}`
      : form.country
    : '';

  // TEAM never reaches the DOB step, so total steps differ by role.
  const totalSteps = isTeam ? 3 : 4;
  const visibleStep = isTeam && step >= 3 ? step - 1 : step;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Please enter your name'); return; }
    if (!form.role || !form.sport) return;
    if (!isTeam && !dob) { toast.error('Date of birth is required'); return; }
    if (!isTeam && !form.gender) { toast.error('Please select your gender'); return; }
    if (!termsAccepted) { toast.error('Please accept the Terms and Privacy Policy to continue'); return; }
    setLoading(true);
    try {
      const age = !isTeam && dob ? ageFrom(dob) : undefined;
      await completeGoogleOnboarding({
        name: form.name.trim(),
        role: form.role,
        sport: form.sport,
        ...(!isTeam && form.gender && { gender: form.gender }),
        ...(requiresAthleticsEvents && { athleticsEvents: form.athleticsEvents }),
        ...(age !== undefined && { age }),
        ...(!isTeam && dob && { dateOfBirth: dob.toISOString() }),
        location: location || undefined,
        height: isTeam ? undefined : (form.height || undefined),
      });
      navigate('/home');
    } catch (err: any) {
      if (err?.code === 'NO_SESSION') {
        toast.error('Your session expired. Please sign in again.');
        navigate('/login');
      } else {
        const details = err?.response?.data?.details;
        toast.error(Array.isArray(details) ? details.join(', ') : (err?.message || 'Could not finish setup. Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => { await logout(); navigate('/login'); };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-4" />
          <p className="text-gray-custom">Complete your profile</p>
          {onboardingPrefill?.email && (
            <p className="text-xs text-gray-custom/70 mt-1">Signed in as {onboardingPrefill.email}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-8 border border-line">
          {/* Progress */}
          <div className="flex gap-2 mb-6">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <div key={s} className={`flex-1 h-1 rounded-full ${s <= visibleStep ? 'bg-primary' : 'bg-elevated'}`} />
            ))}
          </div>

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

          {/* Step 2: Name (+ DOB for individuals) */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">{isTeam ? 'Your details' : 'Your details'}</h2>
              <div>
                <label className="block text-sm text-gray-custom mb-2">{isTeam ? 'Team Name' : 'Full Name'}</label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground"
                  placeholder={isTeam ? 'Your team or academy name' : 'Your full name'}
                />
              </div>

              {!isTeam && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-custom mb-1">Date of Birth <span className="text-primary">*</span></label>
                    <p className="text-xs text-gray-custom mb-2">This cannot be changed later.</p>
                    <DOBPicker value={dob} onChange={setDob} />
                  </div>
                  {dob && (
                    <p className="text-sm text-center text-foreground/70">
                      Selected: <span className="text-foreground font-medium">
                        {dob.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </p>
                  )}

                  {isUnder13Athlete && (
                    <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/5 p-4 space-y-3">
                      <p className="text-sm text-yellow-300/90">
                        Athletes under 13 must be managed by a parent or academy. This account and its
                        Google login will belong to the <span className="font-semibold">parent or academy</span>.
                        Once the athlete turns 13, you can hand over the account to them from Settings.
                      </p>
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={guardianConsent}
                          onChange={(e) => setGuardianConsent(e.target.checked)}
                          className="mt-0.5 accent-primary w-4 h-4 shrink-0" />
                        <span className="text-sm text-foreground/80">
                          I am the parent, guardian, or academy (or have their consent), and this Google
                          account belongs to them.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              <button type="button"
                onClick={() => { if (form.name.trim() && (isTeam || dob)) setStep(isTeam ? 4 : 3); }}
                disabled={!form.name.trim() || (!isTeam && (!dob || (isUnder13Athlete && !guardianConsent)))}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50">
                Continue
              </button>
              <button type="button" onClick={() => setStep(1)}
                className="w-full py-2 text-gray-custom hover:text-foreground transition-colors">Back</button>
            </div>
          )}

          {/* Step 3: Sport */}
          {step === 3 && !athleticsSubStep && (
            <div>
              <h2 className="text-xl font-semibold mb-4">{isTeam ? 'Primary sport' : 'My sport'}</h2>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {SPORTS.map(({ value, label, emoji }) => (
                  <button key={value} type="button"
                    onClick={() => {
                      const next = { ...form, sport: value, athleticsEvents: [] as string[] };
                      setForm(next);
                      if (value === 'ATHLETICS') setAthleticsSubStep(true);
                      else setStep(4);
                    }}
                    className={`w-full p-4 rounded-lg border text-left transition-colors flex items-center gap-3 ${
                      form.sport === value ? 'border-primary bg-primary/10' : 'border-line hover:border-gray-custom'
                    }`}>
                    <span className="text-2xl">{emoji}</span>
                    <span className="font-medium">{label}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setStep(2)}
                className="w-full mt-4 py-2 text-gray-custom hover:text-foreground transition-colors">Back</button>
            </div>
          )}

          {/* Step 3b: Athletics events */}
          {step === 3 && athleticsSubStep && (
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
                            onClick={() => setForm({
                              ...form,
                              athleticsEvents: selected
                                ? form.athleticsEvents.filter((ev) => ev !== event)
                                : [...form.athleticsEvents, event],
                            })}
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
                onClick={() => { if (form.athleticsEvents.length > 0) { setAthleticsSubStep(false); setStep(4); } }}
                disabled={form.athleticsEvents.length === 0}
                className="w-full mt-4 py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50">
                Continue
              </button>
              <button type="button"
                onClick={() => { setAthleticsSubStep(false); setForm({ ...form, sport: '', athleticsEvents: [] }); }}
                className="w-full py-2 text-gray-custom hover:text-foreground transition-colors">Back</button>
            </div>
          )}

          {/* Step 4: Location + gender + height + terms */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{isTeam ? 'Location' : 'Location & Height'}</h2>
                <p className="text-sm text-gray-custom mt-1">Location & height are optional — you can skip them.</p>
              </div>

              <div>
                <label className="block text-sm text-gray-custom mb-2">Country</label>
                <select value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value, state: '', city: '' })}
                  className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground">
                  <option value="">Select country</option>
                  {COUNTRY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {form.country && states.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-custom mb-2">State / Province</label>
                  <select value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value, city: '' })}
                    className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground">
                    <option value="">Select state</option>
                    {states.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {form.state && (
                <div>
                  <label className="block text-sm text-gray-custom mb-2">City</label>
                  <input type="text" value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Enter your city"
                    className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom" />
                </div>
              )}

              {!isTeam && (
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Gender <span className="text-primary">*</span></label>
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

              {!isTeam && (
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Height</label>
                  <select value={form.height}
                    onChange={(e) => setForm({ ...form, height: e.target.value })}
                    className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground">
                    <option value="">Select height</option>
                    {HEIGHT_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                  </select>
                </div>
              )}

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 accent-primary w-4 h-4 shrink-0" />
                <span className="text-sm text-foreground/80">
                  I agree to the{' '}
                  <button type="button" onClick={(e) => { e.preventDefault(); setLegalDoc('terms'); }}
                    className="text-primary hover:text-primary-light underline">Terms &amp; Conditions</button>{' '}
                  and{' '}
                  <button type="button" onClick={(e) => { e.preventDefault(); setLegalDoc('privacy'); }}
                    className="text-primary hover:text-primary-light underline">Privacy Policy</button>.
                  I understand there is <span className="font-semibold">zero tolerance for objectionable
                  content or abusive behavior</span>, and that such content and users may be removed.
                </span>
              </label>

              <button type="submit" disabled={loading || !termsAccepted || (!isTeam && !form.gender)}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50">
                {loading ? 'Finishing…' : 'Finish & enter All For 1'}
              </button>
              <button type="button" onClick={() => setStep(3)}
                className="w-full py-2 text-gray-custom hover:text-foreground transition-colors">Back</button>
            </div>
          )}

          <button type="button" onClick={signOut}
            className="mt-6 w-full text-center text-xs text-gray-custom hover:text-foreground transition-colors">
            Not you? Sign out
          </button>
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

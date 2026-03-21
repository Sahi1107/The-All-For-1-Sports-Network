import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import logoUrl from '../assets/logo.svg';
import { Mail } from 'lucide-react';

const ROLES = [
  { value: 'ATHLETE', label: 'Athlete', desc: 'Showcase your skills & compete' },
  { value: 'COACH',   label: 'Coach',   desc: 'Discover & develop talent' },
  { value: 'SCOUT',   label: 'Scout',   desc: 'Find the next big star' },
] as const;

const SPORTS = [
  { value: 'BASKETBALL', label: 'Basketball', emoji: '\u{1F3C0}' },
  { value: 'FOOTBALL',   label: 'Football',   emoji: '\u{26BD}' },
  { value: 'CRICKET',    label: 'Cricket',    emoji: '\u{1F3CF}' },
] as const;

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export default function Register() {
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    role:  '' as 'ATHLETE' | 'COACH' | 'SCOUT' | '',
    sport: '' as 'BASKETBALL' | 'FOOTBALL' | 'CRICKET' | '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.role || !form.sport) return;
    setLoading(true);
    try {
      await register({
        name:     form.name,
        email:    form.email,
        password: form.password,
        role:     form.role,
        sport:    form.sport,
      });
      setDone(true);
    } catch (err: any) {
      const code = err.code ?? '';
      if (code === 'auth/email-already-in-use') {
        toast.error('An account with that email already exists.');
      } else if (code === 'auth/weak-password') {
        toast.error('Password is too weak.');
      } else {
        toast.error(err.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const canAdvanceStep1 =
    form.name.trim() &&
    form.email.trim() &&
    PASSWORD_REGEX.test(form.password);

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark p-4">
        <div className="w-full max-w-md text-center">
          <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-8" />
          <div className="bg-dark-light rounded-2xl p-8 border border-dark-lighter">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Check your email</h2>
            <p className="text-gray-custom text-sm mb-6">
              We sent a verification link to{' '}
              <span className="text-white font-medium">{form.email}</span>.
              Click it to activate your account — you won't be able to log in until it's verified.
            </p>
            <Link
              to="/login"
              className="block w-full py-3 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-4" />
          <p className="text-gray-custom">Join the network</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-dark-light rounded-2xl p-8 border border-dark-lighter">
          {/* Progress */}
          <div className="flex gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`flex-1 h-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-dark-lighter'}`} />
            ))}
          </div>

          {/* Step 1: Basic info */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Create Account</h2>
              <div>
                <label className="block text-sm text-gray-custom mb-2">Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-custom mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-custom mb-2">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white"
                  placeholder="Min 8 chars, upper + lower + number"
                />
                {form.password && !PASSWORD_REGEX.test(form.password) && (
                  <p className="text-xs text-red-400 mt-1">
                    Must be 8+ characters with an uppercase letter, lowercase letter, and number.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { if (canAdvanceStep1) setStep(2); }}
                disabled={!canAdvanceStep1}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Role */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">I am a...</h2>
              <div className="space-y-3">
                {ROLES.map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setForm({ ...form, role: value }); setStep(3); }}
                    className={`w-full p-4 rounded-lg border text-left transition-colors ${
                      form.role === value ? 'border-primary bg-primary/10' : 'border-dark-lighter hover:border-gray-custom'
                    }`}
                  >
                    <p className="font-medium">{label}</p>
                    <p className="text-sm text-gray-custom">{desc}</p>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setStep(1)}
                className="w-full mt-4 py-2 text-gray-custom hover:text-white transition-colors">
                Back
              </button>
            </div>
          )}

          {/* Step 3: Sport */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">My sport</h2>
              <div className="space-y-3">
                {SPORTS.map(({ value, label, emoji }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, sport: value })}
                    className={`w-full p-4 rounded-lg border text-left transition-colors flex items-center gap-3 ${
                      form.sport === value ? 'border-primary bg-primary/10' : 'border-dark-lighter hover:border-gray-custom'
                    }`}
                  >
                    <span className="text-2xl">{emoji}</span>
                    <span className="font-medium">{label}</span>
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={loading || !form.sport}
                className="w-full mt-6 py-3 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Creating account…' : 'Join All For 1'}
              </button>
              <button type="button" onClick={() => setStep(2)}
                className="w-full mt-2 py-2 text-gray-custom hover:text-white transition-colors">
                Back
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-gray-custom">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary-light">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

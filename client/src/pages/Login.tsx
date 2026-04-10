import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import logoUrl from '../assets/logo.svg';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      const code = err.code ?? err.message ?? '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        toast.error('Invalid email or password');
      } else {
        toast.error(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark p-4 relative overflow-hidden">
      {/* Background video */}
      {/* eslint-disable-next-line */}
      <video
        autoPlay
        loop
        muted
        playsInline
        // @ts-ignore — webkit prefix needed for iOS Safari autoplay
        webkit-playsinline=""
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
      >
        <source src="/about.mp4" type="video/mp4" />
      </video>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logoUrl} alt="All For 1" className="h-32 mx-auto mb-4" />
          <p className="text-gray-custom">The network for the sports ecosystem</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-dark-light rounded-2xl p-8 border border-dark-lighter">
          <h2 className="text-xl font-semibold mb-6">Sign In</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-custom mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-custom">Password</label>
                <Link to="/forgot-password" className="text-xs text-primary hover:text-primary-light">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white"
                placeholder="Enter your password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="mt-6 text-center text-sm text-gray-custom">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-primary hover:text-primary-light">Sign Up</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useLogo } from '../hooks/useLogo';
import { CheckCircle, XCircle, ShieldCheck } from 'lucide-react';

/**
 * Guardian consent for an admin-created under-13 account. The guardian arrives
 * via the emailed link; consenting activates the account and triggers the
 * welcome email with login details. Mirrors HandoverConsent.
 */
export default function GuardianConsent() {
  const logoUrl = useLogo();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>(
    token ? 'idle' : 'error',
  );
  const [errorMsg, setErrorMsg] = useState(token ? '' : 'Invalid or missing consent link.');
  const [athleteName, setAthleteName] = useState('');

  const accept = async () => {
    setStatus('submitting');
    try {
      const { data } = await api.post('/auth/guardian-consent', { token });
      setAthleteName(data.athleteName ?? '');
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.response?.data?.error ?? 'This consent link is invalid or has expired.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md text-center">
        <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-8" />
        <div className="bg-card rounded-2xl p-8 border border-line">
          {status === 'idle' || status === 'submitting' ? (
            <>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={32} className="text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Guardian consent</h2>
              <p className="text-gray-custom text-sm mb-4">
                An organizer created an All For 1 account for a child under 13. The account is
                <span className="text-foreground font-medium"> private and inactive</span> until you,
                as the parent or guardian, consent. On consent, you'll receive login details by email
                to manage the account.
              </p>
              <p className="text-yellow-400/80 text-xs mb-6">
                Only accept if you are the parent, guardian, or academy responsible for this child.
              </p>
              <button
                onClick={accept}
                disabled={status === 'submitting'}
                className="block w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {status === 'submitting' ? 'Submitting…' : 'I consent'}
              </button>
            </>
          ) : status === 'success' ? (
            <>
              <CheckCircle size={48} className="text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Consent recorded</h2>
              <p className="text-gray-custom text-sm mb-6">
                Thank you. {athleteName ? `${athleteName}'s` : 'The'} account is now active — we've
                emailed you the login details so you can manage it.
              </p>
              <Link to="/login" className="block w-full py-3 bg-surface border border-line text-foreground font-semibold rounded-lg hover:bg-elevated transition-colors">
                Go to Sign In
              </Link>
            </>
          ) : (
            <>
              <XCircle size={48} className="text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Couldn't process consent</h2>
              <p className="text-gray-custom text-sm mb-6">{errorMsg}</p>
              <Link to="/login" className="block w-full py-3 bg-surface border border-line text-foreground font-semibold rounded-lg hover:bg-elevated transition-colors">
                Back to Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

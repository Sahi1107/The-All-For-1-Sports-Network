import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';
import logoUrl from '../assets/logo.svg';
import { CheckCircle, XCircle, ShieldCheck } from 'lucide-react';

export default function HandoverConsent() {
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
      const { data } = await api.post('/auth/handover/consent', { token });
      setAthleteName(data.athleteName ?? '');
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.response?.data?.error ?? 'This consent link is invalid or has expired.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark p-4">
      <div className="w-full max-w-md text-center">
        <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-8" />
        <div className="bg-dark-light rounded-2xl p-8 border border-dark-lighter">
          {status === 'idle' || status === 'submitting' ? (
            <>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={32} className="text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Profile handover consent</h2>
              <p className="text-gray-custom text-sm mb-4">
                This account is currently managed by you as a parent or academy. By accepting, the
                athlete will be able to set their <span className="text-white font-medium">own email
                and password</span> and take full control of the account.
              </p>
              <p className="text-yellow-400/80 text-xs mb-6">
                Only accept if you intend to hand over this account. This action cannot be undone.
              </p>
              <button
                onClick={accept}
                disabled={status === 'submitting'}
                className="block w-full py-3 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {status === 'submitting' ? 'Submitting…' : 'I consent to the handover'}
              </button>
            </>
          ) : status === 'success' ? (
            <>
              <CheckCircle size={48} className="text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Consent recorded</h2>
              <p className="text-gray-custom text-sm mb-6">
                Thank you. {athleteName || 'The athlete'} can now complete the handover from their
                account settings by setting a new email and password.
              </p>
              <Link to="/login" className="block w-full py-3 bg-dark border border-dark-lighter text-white font-semibold rounded-lg hover:bg-dark-lighter transition-colors">
                Done
              </Link>
            </>
          ) : (
            <>
              <XCircle size={48} className="text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Couldn't process consent</h2>
              <p className="text-gray-custom text-sm mb-6">{errorMsg}</p>
              <Link to="/login" className="block w-full py-3 bg-dark border border-dark-lighter text-white font-semibold rounded-lg hover:bg-dark-lighter transition-colors">
                Back to Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

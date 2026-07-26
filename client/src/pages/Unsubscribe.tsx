import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useLogo } from '../hooks/useLogo';
import api from '../api/client';

// Public page hit from an email "unsubscribe" link. Unsubscribes on load using
// the token (no login), then confirms. Omitting `type` unsubscribes from all.
export default function Unsubscribe() {
  const logoUrl = useLogo();
  const [params] = useSearchParams();
  const token = params.get('token');
  const type = params.get('type') || undefined;
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [scope, setScope] = useState<{ scope: string; label?: string } | null>(null);

  useEffect(() => {
    if (!token) { setState('error'); return; }
    api.post('/notifications/unsubscribe', { token, ...(type && { type }) })
      .then((r) => { setScope(r.data); setState('done'); })
      .catch(() => setState('error'));
  }, [token, type]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md text-center">
        <img src={logoUrl} alt="All For 1" className="h-16 mx-auto mb-8" />
        <div className="bg-card rounded-2xl p-8 border border-line">
          {state === 'loading' && <p className="text-gray-custom text-sm py-4">Updating your preferences…</p>}

          {state === 'done' && (
            <>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={30} className="text-primary" />
              </div>
              <h1 className="text-xl font-semibold mb-2">You're unsubscribed</h1>
              <p className="text-gray-custom text-sm mb-6">
                {scope?.scope === 'type'
                  ? <>You'll no longer get <span className="text-foreground font-medium">{scope.label}</span> emails. Other notifications are unchanged.</>
                  : <>You'll no longer receive activity notification emails. Account &amp; security emails still apply.</>}
              </p>
              <p className="text-xs text-gray-custom">
                Changed your mind? Adjust everything anytime in{' '}
                <Link to="/settings/notifications" className="text-primary hover:text-primary-light underline">notification settings</Link>.
              </p>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-400/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle size={30} className="text-red-400" />
              </div>
              <h1 className="text-xl font-semibold mb-2">Link expired</h1>
              <p className="text-gray-custom text-sm mb-6">This unsubscribe link is no longer valid. You can manage everything from your settings instead.</p>
              <Link to="/settings/notifications" className="inline-block px-5 py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm transition-colors">
                Notification settings
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

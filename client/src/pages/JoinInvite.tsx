import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLogo } from '../hooks/useLogo';
import api from '../api/client';
import { setRefCode } from '../config/referral';
import { track } from '../config/analytics';
import BallLoader from '../components/BallLoader';

interface Resolved {
  inviter: { id: string; name: string; avatar?: string | null; role: string; sport?: string | null };
  kind: string;
  team?: { name: string } | null;
  tournament?: { name: string } | null;
  note?: string | null;
}

const roleWord: Record<string, string> = { COACH: 'Coach', SCOUT: 'Scout', TEAM: 'Academy', AGENT: 'Agent', MEDIA: 'Media', ATHLETE: 'Athlete', ADMIN: '' };

export default function JoinInvite() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const logoUrl = useLogo();
  const [data, setData] = useState<Resolved | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!code) { setState('error'); return; }
    setRefCode(code); // carried through signup for attribution
    api.get(`/invite/resolve/${code}`)
      .then((r) => { setData(r.data); setState('ok'); track('invite_landing_viewed', { kind: r.data?.kind }); })
      .catch(() => setState('error'));
  }, [code]);

  const context = () => {
    if (!data) return null;
    if (data.team) return <>to join <span className="text-primary font-semibold">{data.team.name}</span></>;
    if (data.tournament) return <>to <span className="text-primary font-semibold">{data.tournament.name}</span></>;
    return <>to join <span className="text-primary font-semibold">All For 1</span></>;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4 relative overflow-hidden">
      <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none">
        <source src="/about.mp4" type="video/mp4" />
      </video>

      <div className="w-full max-w-md relative z-10">
        <img src={logoUrl} alt="All For 1" className="h-16 mx-auto mb-8" />

        {state === 'loading' && <div className="flex justify-center py-10"><BallLoader /></div>}

        {state === 'error' && (
          <div className="bg-card rounded-2xl p-8 border border-line text-center">
            <h1 className="text-xl font-semibold mb-2">Invite not found</h1>
            <p className="text-gray-custom text-sm mb-6">This invite link is no longer valid — but you can still join.</p>
            <Link to="/register" className="inline-block px-6 py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors">Create your account</Link>
          </div>
        )}

        {state === 'ok' && data && (
          <div className="bg-card rounded-2xl p-8 border border-line text-center">
            <div className="flex flex-col items-center mb-5">
              {data.inviter.avatar
                ? <img src={data.inviter.avatar} alt={data.inviter.name} className="w-20 h-20 rounded-full object-cover border-2 border-primary/40" />
                : <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary-light">{data.inviter.name?.charAt(0).toUpperCase()}</div>}
            </div>
            <h1 className="text-2xl font-bold leading-tight mb-1">
              {data.inviter.name} invited you
            </h1>
            <p className="text-gray-custom mb-1">{context()}</p>
            {roleWord[data.inviter.role] && <p className="text-xs text-gray-custom/70 mb-4">{data.inviter.name} is a {roleWord[data.inviter.role]}{data.inviter.sport ? ` · ${data.inviter.sport.charAt(0) + data.inviter.sport.slice(1).toLowerCase()}` : ''} on All For 1</p>}

            {data.note && (
              <p className="text-sm text-foreground/80 bg-surface border border-line rounded-lg px-4 py-3 mb-5 italic">“{data.note}”</p>
            )}

            <p className="text-sm text-gray-custom mb-6">
              All For 1 is where athletes get seen — verified stats, a Performance Card, tournaments, and scouts &amp; coaches who find you.
            </p>

            <button onClick={() => navigate('/register')} className="block w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors mb-3">
              Create your account
            </button>
            <p className="text-xs text-gray-custom">
              Already have an account? <Link to="/login" className="text-primary hover:text-primary-light">Sign in</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

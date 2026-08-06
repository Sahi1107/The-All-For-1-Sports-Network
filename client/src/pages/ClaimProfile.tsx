import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { KeyRound, CheckCircle, ArrowRight, Trophy } from 'lucide-react';
import api from '../api/client';
import { auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLogo } from '../hooks/useLogo';

/**
 * Claim a profile an organiser created for you.
 *
 * Players at a tournament are often rostered before they're on the platform — no
 * email, just a name on a team sheet. They still play, get scored in the tracker
 * and appear on the rankings, all against a profile nobody owns yet. This page is
 * how the real player takes that profile over, keeping every stat and ranking
 * already recorded against it.
 *
 * Two steps on purpose: PREVIEW the profile (name, position, the teams it played
 * for) and only then redeem. Claiming is irreversible and the record belongs to a
 * real person, so the last thing before committing is a human confirming "yes,
 * that's me" — not just a code that happened to parse.
 */
export default function ClaimProfile() {
  const logoUrl = useLogo();
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  // /claim/:code lets an organiser share a direct link instead of dictating a code.
  const { code: codeFromUrl } = useParams<{ code?: string }>();

  const [code, setCode] = useState(codeFromUrl ?? '');
  const [profile, setProfile] = useState<{
    userId: string; name: string; position: string | null; avatar: string | null;
    teams: { teamName: string; tournamentName: string }[];
  } | null>(null);
  const [status, setStatus] = useState<'entry' | 'checking' | 'confirm' | 'claiming' | 'done'>('entry');
  const [error, setError] = useState('');

  const lookUp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setStatus('checking');
    setError('');
    try {
      const { data } = await api.post('/auth/claim/preview', { code: code.trim() });
      setProfile(data.profile);
      setStatus('confirm');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'That claim code is not valid or has already been used.');
      setStatus('entry');
    }
  };

  const confirm = async () => {
    setStatus('claiming');
    setError('');
    try {
      await api.post('/auth/claim', { code: code.trim() });
      // The profile's userId is now on our Firebase custom claims — force a token
      // refresh so the very next request authenticates as the claimed profile
      // rather than the account we signed in with.
      const firebaseUser = auth.currentUser;
      if (firebaseUser) await firebaseUser.getIdToken(true);
      const me = await api.get('/auth/me');
      updateUser(me.data.user);
      setStatus('done');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Could not claim this profile.');
      setStatus('confirm');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-8" />
        <div className="bg-card rounded-2xl p-8 border border-line">
          {status === 'done' && profile ? (
            <div className="text-center">
              <CheckCircle size={48} className="text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Profile claimed</h2>
              <p className="text-gray-custom text-sm mb-6">
                Welcome, {profile.name}. Your match stats and ranking history are on your
                profile — it's yours now, and you can edit it like any other.
              </p>
              <button
                onClick={() => navigate(`/profile/${profile.userId}`)}
                className="flex items-center justify-center gap-2 w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors"
              >
                View my profile <ArrowRight size={16} />
              </button>
            </div>
          ) : status === 'confirm' || status === 'claiming' ? (
            <div>
              <h2 className="text-xl font-semibold mb-1 text-center">Is this you?</h2>
              <p className="text-gray-custom text-sm mb-5 text-center">
                Claiming links this profile — and everything recorded on it — to your account.
              </p>

              <div className="rounded-xl border border-line bg-surface p-4 mb-5">
                <div className="flex items-center gap-3">
                  {profile?.avatar ? (
                    <img src={profile.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      {profile?.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{profile?.name}</p>
                    {profile?.position && <p className="text-xs text-gray-custom">{profile.position}</p>}
                  </div>
                </div>
                {profile && profile.teams.length > 0 && (
                  <ul className="mt-3 pt-3 border-t border-line space-y-1.5">
                    {profile.teams.map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-custom">
                        <Trophy size={12} className="mt-0.5 shrink-0 text-primary/70" />
                        <span><span className="text-foreground">{t.teamName}</span> · {t.tournamentName}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

              <button
                onClick={confirm}
                disabled={status === 'claiming'}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50 mb-2"
              >
                {status === 'claiming' ? 'Claiming…' : "Yes, this is me — claim it"}
              </button>
              <button
                onClick={() => { setProfile(null); setStatus('entry'); setError(''); }}
                disabled={status === 'claiming'}
                className="w-full py-3 border border-line text-gray-custom hover:text-foreground font-semibold rounded-lg transition-colors"
              >
                That's not me
              </button>
            </div>
          ) : (
            <form onSubmit={lookUp}>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <KeyRound size={32} className="text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2 text-center">Claim your profile</h2>
              <p className="text-gray-custom text-sm mb-6 text-center">
                Played a tournament before you joined? Your organiser can give you a claim
                code. Enter it here to take over the profile they created — with all the
                stats and rankings you already earned.
              </p>

              <label htmlFor="claim-code" className="block text-xs text-gray-custom mb-1.5">Claim code</label>
              <input
                id="claim-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXX-XXXX"
                maxLength={32}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-4 py-3 bg-surface border border-line rounded-lg text-center font-mono tracking-widest uppercase focus:outline-none focus:border-primary placeholder-gray-custom/50"
              />

              {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}

              <button
                type="submit"
                disabled={!code.trim() || status === 'checking'}
                className="w-full mt-5 py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {status === 'checking' ? 'Checking…' : 'Find my profile'}
              </button>

              <Link to="/home" className="block text-center text-xs text-gray-custom hover:text-foreground mt-4">
                Skip for now
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

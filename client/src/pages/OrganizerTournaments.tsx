import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MapPin, Calendar, ShieldCheck } from 'lucide-react';
import api from '../api/client';
import BallLoader from '../components/BallLoader';

interface OrgTournament {
  id: string; name: string; sport: string; status: string;
  startDate?: string | null; city?: string | null; venue?: string | null;
}

const SPORT = (s?: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ') : '');
const STATUS_STYLE: Record<string, string> = {
  UPCOMING: 'bg-blue-500/20 text-blue-400', REGISTRATION_OPEN: 'bg-accent/20 text-accent',
  REGISTRATION_CLOSED: 'bg-amber-500/20 text-amber-300', IN_PROGRESS: 'bg-accent/20 text-accent',
  COMPLETED: 'bg-gray-500/20 text-gray-custom', CANCELLED: 'bg-red-500/20 text-red-400',
};

/** Landing for organisers: the tournaments they've been given access to run. */
export default function OrganizerTournaments() {
  const { data, isLoading } = useQuery<OrgTournament[]>({
    queryKey: ['my-organizing-tournaments'],
    queryFn: async () => (await api.get('/tournaments/mine/organizing')).data.tournaments,
  });

  if (isLoading) return <div className="flex justify-center py-20"><BallLoader /></div>;

  const tournaments = data ?? [];
  // One tournament → drop them straight into it.
  if (tournaments.length === 1) return <Navigate to={`/admin/tournaments/${tournaments[0].id}/manage`} replace />;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={20} className="text-primary" />
        <h1 className="text-2xl font-bold">My tournaments</h1>
      </div>
      <p className="text-sm text-gray-custom mb-6">Tournaments you organise. Open one to manage teams, the draw, scheduling and results.</p>

      {tournaments.length === 0 ? (
        <div className="bg-card border border-line rounded-xl p-8 text-center">
          <p className="text-sm text-gray-custom">You don’t have organiser access to any tournament yet.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link
                to={`/admin/tournaments/${t.id}/manage`}
                className="flex items-center gap-3 bg-card border border-line hover:border-primary rounded-xl p-4 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold truncate">{t.name}</h2>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLE[t.status] ?? 'bg-elevated text-gray-custom'}`}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-custom mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{SPORT(t.sport)}</span>
                    {(t.city || t.venue) && <span className="flex items-center gap-1"><MapPin size={11} />{[t.venue, t.city].filter(Boolean).join(', ')}</span>}
                    {t.startDate && <span className="flex items-center gap-1"><Calendar size={11} />{new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  </p>
                </div>
                <ChevronRight size={18} className="text-gray-custom group-hover:text-primary shrink-0 transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

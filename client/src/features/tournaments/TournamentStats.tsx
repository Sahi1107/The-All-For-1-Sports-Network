import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import BallLoader from '../../components/BallLoader';
import { BarChart3 } from 'lucide-react';
import StatLeaders from '../statTracker/components/StatLeaders';
import type { LeaderCategory } from '../statTracker/leaders';

const STAT_SPORTS = new Set(['FOOTBALL', 'BASKETBALL', 'CRICKET']);

/** Stats tab — tournament-wide stat leaders (from the published stat tables),
 *  one card per category, sport-appropriate. */
export default function TournamentStats({ tournamentId, sport }: { tournamentId: string; sport: string }) {
  const { data, isLoading, isError } = useQuery<{ sport: string; categories: LeaderCategory[] }>({
    queryKey: ['tournament-leaders', tournamentId],
    queryFn: async () => (await api.get(`/tournaments/${tournamentId}/leaders`)).data,
  });

  if (isLoading) return <div className="flex justify-center py-16"><BallLoader /></div>;
  if (isError) {
    return <div className="bg-card rounded-xl border border-line p-12 text-center text-sm text-gray-custom">Couldn't load stats.</div>;
  }

  const categories = data?.categories ?? [];

  // Deliberate empty states: non-stat sport vs no data yet.
  if (categories.length === 0) {
    const nonStat = !STAT_SPORTS.has(sport);
    return (
      <div className="bg-card rounded-xl border border-line p-10 sm:p-12 text-center">
        <BarChart3 size={28} className="mx-auto mb-3 text-gray-custom" />
        <h3 className="text-base font-semibold mb-1.5">{nonStat ? 'Stats not tracked' : 'No stats yet'}</h3>
        <p className="text-sm text-gray-custom max-w-sm mx-auto">
          {nonStat
            ? `Per-player stat leaders aren't tracked for ${sport.toLowerCase()} tournaments.`
            : 'Stat leaders will appear here once matches have been played and results published.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><BarChart3 size={15} className="text-primary" /> Tournament leaders</h2>
        <p className="text-xs text-gray-custom mt-0.5">Top performers across every match in this tournament.</p>
      </div>
      <StatLeaders categories={categories} />
    </div>
  );
}

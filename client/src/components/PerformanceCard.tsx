import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Award } from 'lucide-react';
import api from '../api/client';

/**
 * Performance Card on the athlete profile. Fetches /users/:id/performance-card.
 *
 * Right now the verified/competition layer is empty for every athlete (no
 * tournaments/matches/stats/endorsements recorded in prod yet), so the card
 * shows an honest, self-nudging empty state plus the only populatable-today
 * content: self-reported achievements and (for athletics) events. The
 * hero-band + per-tournament "receipts" UI is deliberately deferred until
 * there's data to render — the endpoint already returns it the moment it exists.
 */
export default function PerformanceCard({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['performance-card', id],
    queryFn: async () => (await api.get(`/users/${id}/performance-card`)).data,
    enabled: !!id,
  });
  if (!data) return null;

  const {
    career = null,
    tournaments = [],
    competition = [],
    rankings = [],
    achievements = [],
    athleticsEvents = [],
  } = data as {
    career: unknown; tournaments: unknown[]; competition: unknown[]; rankings: unknown[];
    achievements: string[]; athleticsEvents: string[];
  };
  const hasVerified = !!career || tournaments.length > 0 || competition.length > 0 || rankings.length > 0;

  return (
    <div className="bg-card rounded-xl border border-line p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-4">
        <BadgeCheck size={16} className="text-primary-light" />
        Performance Card
      </h2>

      {/* Verified / competition record. Held until data exists; today this is
          empty for all athletes, so we show the honest, self-nudging state. */}
      {!hasVerified && (
        <div className="text-center py-6 px-4 rounded-lg bg-surface border border-line">
          <p className="text-sm text-foreground/75">No recorded competition data yet.</p>
          <p className="text-xs text-gray-custom mt-1">
            Performances are recorded at All For 1 partnered tournaments.
          </p>
        </div>
      )}

      {/* Athletics events (context) */}
      {athleticsEvents.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-gray-custom mb-2">Events</p>
          <div className="flex flex-wrap gap-2">
            {athleticsEvents.map((e) => (
              <span key={e} className="text-xs px-2.5 py-1 rounded-full bg-elevated text-foreground/80">{e}</span>
            ))}
          </div>
        </div>
      )}

      {/* Achievements — self-reported (labeled, per the trust grammar) */}
      {achievements.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs uppercase tracking-wide text-gray-custom">Achievements</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-gray-custom">Self-reported</span>
          </div>
          <ul className="space-y-1.5">
            {achievements.map((a, i) => (
              <li key={i} className="text-sm text-foreground/85 flex gap-2">
                <Award size={14} className="text-secondary shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

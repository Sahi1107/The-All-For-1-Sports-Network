import { Award } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LeaderCategory } from '../leaders';

/** Tournament stat leaders, one card per category (sport-aware). Presentational:
 *  the caller supplies `categories` from either the live tracker state
 *  (tournamentLeaders) or the published-stats endpoint (/tournaments/:id/leaders).
 *  `linkProfiles` links each name to its profile — on for the public Stats tab
 *  (real user ids), off in the tracker/demo (which carry synthetic ids). */
export default function StatLeaders({ categories, linkProfiles = false }: { categories: LeaderCategory[]; linkProfiles?: boolean }) {
  if (categories.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-line p-6 text-center text-sm text-gray-custom">
        <Award size={22} className="mx-auto mb-2 text-gray-custom" />
        Stat leaders appear once matches have been played.
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {categories.map((cat) => (
        <div key={cat.key} className="bg-card rounded-xl border border-line overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
            <Award size={14} className="text-primary" />
            <h4 className="text-sm font-semibold">{cat.label}</h4>
          </div>
          <div className="divide-y divide-line">
            {cat.rows.map((r, i) => (
              <div key={r.userId} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className={`w-5 text-center font-mono text-xs ${i === 0 ? 'text-amber-300 font-bold' : 'text-gray-custom'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  {linkProfiles
                    ? <Link to={`/profile/${r.userId}`} className="truncate block hover:text-primary-light hover:underline">{r.name}</Link>
                    : <p className="truncate">{r.name}</p>}
                  {r.teamName && <p className="text-[11px] text-gray-custom truncate">{r.teamName}</p>}
                </div>
                <span className="font-mono font-semibold text-primary-light tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

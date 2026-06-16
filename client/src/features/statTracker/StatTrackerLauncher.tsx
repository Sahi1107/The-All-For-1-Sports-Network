import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';
import { Activity, ChevronRight, Trophy, FlaskConical } from 'lucide-react';
import type { TrackerSport } from './types';

const SPORTS: { value: TrackerSport; label: string; emoji: string }[] = [
  { value: 'BASKETBALL', label: 'Basketball', emoji: '🏀' },
  { value: 'FOOTBALL', label: 'Football', emoji: '⚽' },
];

// Tournaments worth tracking are those that have closed registration or are live.
const TRACKABLE = new Set(['REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED']);

export default function StatTrackerLauncher() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sport, setSport] = useState<TrackerSport>('BASKETBALL');

  if (user?.role !== 'ADMIN') return <Navigate to="/home" replace />;

  const { data, isLoading } = useQuery({
    queryKey: ['tracker-tournaments', sport],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments?sport=${sport}&limit=50`);
      return data;
    },
  });

  const tournaments: any[] = (data?.tournaments ?? []).filter((t: any) => TRACKABLE.has(t.status));

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Activity size={22} className="text-primary" />
        <h1 className="text-2xl font-bold">Stat Tracker</h1>
      </div>
      <p className="text-sm text-gray-custom mb-6">
        Pick a sport, then choose a tournament to import its teams and generate fixtures.
      </p>

      {/* Demo sandbox */}
      <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical size={16} className="text-amber-300" />
          <p className="text-sm font-semibold">Try a demo</p>
        </div>
        <p className="text-xs text-gray-custom mb-3">
          Test the trackers with sample teams and players. Nothing is saved — results aren't published.
        </p>
        <div className="flex gap-2">
          <Link to="/admin/stat-tracker/demo/basketball"
            className="flex items-center gap-2 px-3 py-2 bg-elevated text-foreground border border-line hover:border-primary rounded-lg text-sm transition-colors">
            🏀 Basketball demo
          </Link>
          <Link to="/admin/stat-tracker/demo/football"
            className="flex items-center gap-2 px-3 py-2 bg-elevated text-foreground border border-line hover:border-primary rounded-lg text-sm transition-colors">
            ⚽ Football demo
          </Link>
        </div>
      </div>

      {/* Sport picker */}
      <div className="flex gap-2 mb-6">
        {SPORTS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSport(s.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              sport === s.value
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-elevated text-gray-custom hover:text-foreground border border-line'
            }`}
          >
            <span className="text-lg">{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tournaments.length === 0 ? (
        <div className="bg-card rounded-xl border border-line p-12 text-center">
          <Trophy size={28} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-sm text-gray-custom">
            No trackable {sport.toLowerCase()} tournaments. Close registration on a tournament to track it.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-line overflow-hidden divide-y divide-line">
          {tournaments.map((t) => (
            <button
              key={t.id}
              onClick={() => nav(`/admin/stat-tracker/${t.id}`)}
              className="w-full flex items-center gap-4 px-5 py-3 hover:bg-elevated transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-elevated shrink-0 flex items-center justify-center">
                {t.thumbnailUrl
                  ? <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-cover" />
                  : <Trophy size={16} className="text-gray-custom" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-xs text-gray-custom">
                  {t._count?.teams ?? 0} teams · {t.status}
                </p>
              </div>
              <ChevronRight size={16} className="text-gray-custom" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        <Link to="/admin" className="text-xs text-gray-custom hover:text-foreground">← Back to admin</Link>
      </div>
    </div>
  );
}

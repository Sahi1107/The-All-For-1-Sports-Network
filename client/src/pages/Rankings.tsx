import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { Trophy, TrendingUp } from 'lucide-react';

const SPORT_ICONS: Record<string, string> = {
  BASKETBALL: '🏀',
  FOOTBALL: '⚽',
  CRICKET: '🏏',
};

const CATEGORIES: Record<string, string[]> = {
  BASKETBALL: ['OVERALL', 'SCORING', 'REBOUNDING', 'ASSISTS'],
  FOOTBALL: ['OVERALL', 'GOALS', 'ASSISTS', 'DEFENDING'],
  CRICKET: ['OVERALL', 'BATTING', 'BOWLING', 'ALL_ROUND'],
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="w-8 text-center text-lg">🥇</span>;
  if (rank === 2) return <span className="w-8 text-center text-lg">🥈</span>;
  if (rank === 3) return <span className="w-8 text-center text-lg">🥉</span>;
  return <span className="w-8 text-center text-sm text-gray-custom font-semibold">#{rank}</span>;
}

export default function Rankings() {
  const [sport, setSport] = useState('BASKETBALL');
  const [category, setCategory] = useState('OVERALL');

  const { data, isLoading } = useQuery({
    queryKey: ['rankings', sport, category],
    queryFn: async () => {
      const { data } = await api.get(`/rankings?sport=${sport}&category=${category}`);
      return data;
    },
  });

  const rankings = data?.rankings ?? [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Trophy size={22} className="text-secondary" />
        <h1 className="text-2xl font-bold">Player Rankings</h1>
      </div>

      {/* Filters */}
      <div className="bg-dark-light rounded-xl border border-dark-lighter p-4 mb-6 space-y-4">
        <div>
          <p className="text-xs text-gray-custom mb-2">Sport</p>
          <div className="flex gap-2 flex-wrap">
            {['BASKETBALL', 'FOOTBALL', 'CRICKET'].map(s => (
              <button
                key={s}
                onClick={() => { setSport(s); setCategory('OVERALL'); }}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  sport === s ? 'bg-primary text-dark font-semibold' : 'bg-dark text-gray-custom hover:text-white border border-dark-lighter'
                }`}
              >
                {SPORT_ICONS[s]} {s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-custom mb-2">Category</p>
          <div className="flex gap-2 flex-wrap">
            {(CATEGORIES[sport] ?? ['OVERALL']).map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  category === c ? 'bg-secondary text-white' : 'bg-dark text-gray-custom hover:text-white border border-dark-lighter'
                }`}
              >
                {c.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rankings.length === 0 ? (
        <div className="bg-dark-light rounded-xl border border-dark-lighter p-16 text-center">
          <TrendingUp size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">No rankings yet. Rankings are calculated after tournaments.</p>
        </div>
      ) : (
        <div className="bg-dark-light rounded-xl border border-dark-lighter overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-dark-lighter text-xs text-gray-custom font-medium">
            <div className="col-span-1 text-center">Rank</div>
            <div className="col-span-6">Athlete</div>
            <div className="col-span-3 text-center">Position</div>
            <div className="col-span-2 text-right">Score</div>
          </div>

          <div className="divide-y divide-dark-lighter">
            {rankings.map((r: any) => (
              <div
                key={r.id}
                className={`grid grid-cols-12 gap-2 px-5 py-3.5 items-center hover:bg-dark/40 transition-colors ${r.rank <= 3 ? 'bg-dark/20' : ''}`}
              >
                <div className="col-span-1 flex justify-center">
                  <RankBadge rank={r.rank} />
                </div>

                <div className="col-span-6">
                  <Link to={`/profile/${r.athlete?.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="w-9 h-9 rounded-full bg-dark-lighter flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                      {r.athlete?.avatar
                        ? <img src={r.athlete.avatar} alt={r.athlete.name} className="w-full h-full object-cover" />
                        : r.athlete?.name?.charAt(0)
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium">{r.athlete?.name}</p>
                      <p className="text-xs text-gray-custom">{SPORT_ICONS[r.athlete?.sport]} {r.athlete?.location ?? ''}</p>
                    </div>
                  </Link>
                </div>

                <div className="col-span-3 text-center text-xs text-gray-custom">{r.athlete?.position ?? '—'}</div>
                <div className="col-span-2 text-right font-bold text-secondary">{r.score?.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

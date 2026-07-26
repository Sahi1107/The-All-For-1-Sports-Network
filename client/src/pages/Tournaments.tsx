import BallLoader from '../components/BallLoader';
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import { Trophy, MapPin, Calendar, Users, ChevronRight } from 'lucide-react'
import { SPORTS } from '../data/sports'

const SPORT_ICONS: Record<string, string> = Object.fromEntries(
  SPORTS.map(({ value, emoji }) => [value, emoji]),
)
const SPORT_LABELS: Record<string, string> = Object.fromEntries(
  SPORTS.map(({ value, label }) => [value, label]),
)

const STATUS_COLORS: Record<string, string> = {
  UPCOMING: 'bg-blue-500/20 text-blue-400',
  ONGOING: 'bg-accent/20 text-accent',
  COMPLETED: 'bg-gray-500/20 text-gray-custom',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Tournaments() {
  useAuth()
  const navigate = useNavigate()
  const [sportFilter, setSportFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tournaments', sportFilter],
    queryFn: async () => {
      const params = sportFilter ? `?sport=${sportFilter}` : ''
      const { data } = await api.get(`/tournaments${params}`)
      return data
    },
  })

  const tournaments = data?.tournaments ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tournaments</h1>
      </div>

      {/* Sport Filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {['', ...SPORTS.map((s) => s.value)].map((s) => (
          <button
            key={s}
            onClick={() => setSportFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sportFilter === s ? 'bg-primary text-on-primary font-semibold' : 'bg-card text-gray-custom hover:text-foreground border border-line'
            }`}
          >
            {s ? `${SPORT_ICONS[s]} ${SPORT_LABELS[s]}` : 'All Sports'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <BallLoader />
        </div>
      ) : tournaments.length === 0 ? (
        <div className="bg-card rounded-xl border border-line p-16 text-center">
          <Trophy size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">No tournaments found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t: any) => (
            <div
              key={t.id}
              onClick={() => navigate(`/tournaments/${t.id}`)}
              className="bg-card rounded-xl border border-line p-5 cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {t.thumbnailUrl && (
                    <img src={t.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-line" />
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight truncate">{t.name}</h3>
                    <span className="text-xs text-gray-custom">{SPORT_ICONS[t.sport]} {SPORT_LABELS[t.sport] ?? t.sport}</span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status] ?? ''}`}>
                  {t.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-gray-custom">
                {(t.city || t.venue) && <p className="flex items-center gap-1.5"><MapPin size={11} />{t.city || t.venue}</p>}
                {t.startDate && <p className="flex items-center gap-1.5"><Calendar size={11} />{formatDate(t.startDate)}{t.endDate ? ` – ${formatDate(t.endDate)}` : ''}</p>}
                <p className="flex items-center gap-1.5"><Users size={11} />{t._count?.teams ?? 0} teams registered</p>
              </div>

              <div className="flex items-center justify-end mt-4">
                <span className="text-xs text-primary flex items-center gap-1">View details <ChevronRight size={12} /></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import BallLoader from '../components/BallLoader';
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import { Trophy, MapPin, Calendar, Users, ChevronRight, X, Crown, Award, Settings } from 'lucide-react'
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
  const [selected, setSelected] = useState<any | null>(null)
  const [sportFilter, setSportFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tournaments', sportFilter],
    queryFn: async () => {
      const params = sportFilter ? `?sport=${sportFilter}` : ''
      const { data } = await api.get(`/tournaments${params}`)
      return data
    },
  })

  const { data: detail } = useQuery({
    queryKey: ['tournament', selected?.id],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${selected.id}`)
      return data
    },
    enabled: !!selected?.id,
  })

  const tournaments = data?.tournaments ?? []
  const selectedDetail = detail?.tournament ?? selected
  const acceptsTeamRegistration =
    selectedDetail && selectedDetail.format !== 'INDIVIDUAL' &&
    ['UPCOMING', 'REGISTRATION_OPEN'].includes(selectedDetail.status)

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
              onClick={() => setSelected(t)}
              className="bg-card rounded-xl border border-line p-5 cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold leading-tight">{t.name}</h3>
                  <span className="text-xs text-gray-custom">{SPORT_ICONS[t.sport]} {SPORT_LABELS[t.sport] ?? t.sport}</span>
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

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-line w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line sticky top-0 bg-card">
              <h2 className="font-semibold text-lg">{selected.name}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* Meta */}
              <div className="flex flex-wrap gap-4 text-sm text-gray-custom">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selected.status] ?? ''}`}>{selected.status}</span>
                <span className="flex items-center gap-1">{SPORT_ICONS[selected.sport]} {SPORT_LABELS[selected.sport] ?? selected.sport}</span>
                {(selected.city || selected.venue) && <span className="flex items-center gap-1"><MapPin size={13} />{selected.city || selected.venue}</span>}
                {selected.startDate && <span className="flex items-center gap-1"><Calendar size={13} />{formatDate(selected.startDate)}</span>}
              </div>

              {selected.description && <p className="text-sm text-gray-custom">{selected.description}</p>}

              {/* Your team(s) — only visible if the user is a member of any team in this tournament */}
              {(detail?.tournament?.myTeams ?? []).map((t: any) => {
                const isCaptain = t.myRole === 'CAPTAIN'
                return (
                  <div key={t.id} className="bg-surface rounded-lg border border-primary/30 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {t.logo
                          ? <img src={t.logo} alt={t.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                          : <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center font-bold text-primary-light shrink-0">{t.name?.charAt(0).toUpperCase()}</div>}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{t.name}</p>
                          <p className="text-xs text-gray-custom">
                            Your team
                            {t.myRole === 'CAPTAIN' && <> · <Crown size={10} className="inline -mt-0.5" /> Captain</>}
                            {t.myRole === 'COACH'   && <> · <Award size={10} className="inline -mt-0.5" /> Coach</>}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          t.summary.isComplete
                            ? 'bg-accent/20 text-accent'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {t.summary.isComplete
                          ? 'Complete'
                          : `${t.summary.accepted}/${t.summary.total} accepted${t.summary.declined ? ` · ${t.summary.declined} declined` : ''}`}
                      </span>
                    </div>

                    {isCaptain && (
                      <button
                        onClick={() => navigate(`/teams/${t.id}`)}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-card hover:bg-elevated border border-line text-sm rounded-lg transition-colors"
                      >
                        <Settings size={13} /> Manage team
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Register CTA — only show if user has no existing team in this tournament */}
              {acceptsTeamRegistration && (detail?.tournament?.myTeams ?? []).length === 0 && (
                <button
                  onClick={() => navigate(`/tournaments/${selected.id}/register`)}
                  className="w-full px-4 py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold text-sm rounded-lg transition-colors"
                >
                  Register a team
                </button>
              )}

              {/* Registered Teams */}
              {detail?.tournament?.teams?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Registered Teams ({detail.tournament.teams.length})</h3>
                  <div className="space-y-2">
                    {detail.tournament.teams.map((r: any) => (
                      <div key={r.id} className="flex items-center gap-3 py-2 px-3 bg-surface rounded-lg">
                        <Users size={14} className="text-gray-custom" />
                        <span className="text-sm">{r.team?.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

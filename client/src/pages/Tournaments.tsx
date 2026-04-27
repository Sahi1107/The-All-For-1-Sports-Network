import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import { Trophy, MapPin, Calendar, Users, ChevronRight, X } from 'lucide-react'
import toast from 'react-hot-toast'
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
  COMPLETED: 'bg-gray-500/20 text-gray-400',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Tournaments() {
  useAuth()
  const qc = useQueryClient()
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

  const { data: myTeams } = useQuery({
    queryKey: ['teams', 'mine'],
    queryFn: async () => {
      const { data } = await api.get('/teams?mine=true')
      return data
    },
    enabled: !!selected,
  })

  const [selectedTeamId, setSelectedTeamId] = useState('')

  const registerMutation = useMutation({
    mutationFn: (teamId: string) => api.post(`/tournaments/${selected?.id}/register`, { teamId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', selected?.id] })
      toast.success('Team registered!')
    },
    onError: () => toast.error('Registration failed'),
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
              sportFilter === s ? 'bg-primary text-dark font-semibold' : 'bg-dark-light text-gray-custom hover:text-white border border-dark-lighter'
            }`}
          >
            {s ? `${SPORT_ICONS[s]} ${SPORT_LABELS[s]}` : 'All Sports'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tournaments.length === 0 ? (
        <div className="bg-dark-light rounded-xl border border-dark-lighter p-16 text-center">
          <Trophy size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">No tournaments found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t: any) => (
            <div
              key={t.id}
              onClick={() => setSelected(t)}
              className="bg-dark-light rounded-xl border border-dark-lighter p-5 cursor-pointer hover:border-primary/50 transition-colors"
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
          <div className="bg-dark-light rounded-xl border border-dark-lighter w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-lighter sticky top-0 bg-dark-light">
              <h2 className="font-semibold text-lg">{selected.name}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-custom hover:text-white"><X size={18} /></button>
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

              {/* Register */}
              {selected.status === 'UPCOMING' && (
                <div className="bg-dark rounded-lg p-4 border border-dark-lighter">
                  <h3 className="text-sm font-medium mb-3">Register Your Team</h3>
                  <div className="flex gap-2">
                    <select
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                      className="flex-1 bg-dark-light border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                    >
                      <option value="">Select a team</option>
                      {(myTeams?.teams ?? []).map((team: any) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => { if (selectedTeamId) registerMutation.mutate(selectedTeamId) }}
                      disabled={!selectedTeamId || registerMutation.isPending}
                      className="px-4 py-2 bg-primary hover:bg-primary-dark disabled:opacity-50 text-dark font-semibold text-sm rounded-lg transition-colors"
                    >
                      Register
                    </button>
                  </div>
                </div>
              )}

              {/* Registered Teams */}
              {detail?.tournament?.teams?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Registered Teams ({detail.tournament.teams.length})</h3>
                  <div className="space-y-2">
                    {detail.tournament.teams.map((r: any) => (
                      <div key={r.id} className="flex items-center gap-3 py-2 px-3 bg-dark rounded-lg">
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

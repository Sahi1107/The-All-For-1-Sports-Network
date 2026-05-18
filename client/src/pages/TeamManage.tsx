import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import { ArrowLeft, Crown, Award, Users, Search, UserPlus, X, Replace, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

type UserLite = {
  id: string
  name: string
  role: string
  sport?: string
  avatar?: string
  position?: string
}

function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

function Avatar({ user, size = 28 }: { user: { name?: string; avatar?: string }; size?: number }) {
  if (user.avatar) {
    return <img src={user.avatar} alt={user.name ?? ''} style={{ width: size, height: size }} className="rounded-full object-cover" />
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary-light text-xs shrink-0"
    >
      {user.name?.charAt(0).toUpperCase() ?? '?'}
    </div>
  )
}

const STATUS_BADGE: Record<string, string> = {
  ACCEPTED: 'bg-accent/20 text-accent',
  PENDING:  'bg-amber-500/20 text-amber-300',
  DECLINED: 'bg-red-500/20 text-red-400',
}

export default function TeamManage() {
  const { id: teamId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  const [playerSearch, setPlayerSearch] = useState('')
  const debouncedSearch = useDebounced(playerSearch, 250)

  // Inline replace state: which row is currently in "pick a replacement" mode
  const [replaceTargetUserId, setReplaceTargetUserId] = useState<string | null>(null)
  const [replaceSearch, setReplaceSearch] = useState('')
  const debouncedReplaceSearch = useDebounced(replaceSearch, 250)

  // ─── Load team ───────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const { data } = await api.get(`/teams/${teamId}`)
      return data
    },
    enabled: !!teamId,
  })
  const team = data?.team
  const memberIds: string[] = (team?.members ?? []).map((m: any) => m.userId)
  const isCaptain = team && user && team.captainId === user.id

  // ─── Player search (general "Add a player" at the bottom) ────────────────
  const { data: searchResults, isFetching: searchFetching } = useQuery({
    queryKey: ['user-search-team-add', team?.sport, debouncedSearch, memberIds],
    queryFn: async () => {
      const params = new URLSearchParams({ role: 'ATHLETE', limit: '15' })
      if (team?.sport) params.set('sport', team.sport)
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      const { data } = await api.get(`/users?${params}`)
      return data
    },
    enabled: !!team && isCaptain && debouncedSearch.trim().length >= 2,
  })

  // ─── Player search (scoped to inline replace) ────────────────────────────
  const { data: replaceResults, isFetching: replaceFetching } = useQuery({
    queryKey: ['user-search-team-replace', team?.sport, debouncedReplaceSearch, memberIds],
    queryFn: async () => {
      const params = new URLSearchParams({ role: 'ATHLETE', limit: '15' })
      if (team?.sport) params.set('sport', team.sport)
      if (debouncedReplaceSearch.trim()) params.set('search', debouncedReplaceSearch.trim())
      const { data } = await api.get(`/users?${params}`)
      return data
    },
    enabled: !!team && isCaptain && !!replaceTargetUserId && debouncedReplaceSearch.trim().length >= 2,
  })

  // ─── Mutations ───────────────────────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/teams/${teamId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', teamId] })
      toast.success('Member removed')
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Remove failed'),
  })

  const inviteMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/teams/${teamId}/members/invite`, { userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', teamId] })
      setPlayerSearch('')
      toast.success('Invite sent')
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Invite failed'),
  })

  const replaceMutation = useMutation({
    mutationFn: ({ oldUserId, newUserId }: { oldUserId: string; newUserId: string }) =>
      api.post(`/teams/${teamId}/members/${oldUserId}/replace`, { newUserId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', teamId] })
      setReplaceTargetUserId(null)
      setReplaceSearch('')
      toast.success('Replacement invited')
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Replace failed'),
  })

  // ─── Render ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!team) {
    return (
      <div className="bg-dark-light rounded-xl border border-dark-lighter p-12 text-center">
        <p className="text-gray-custom">Team not found.</p>
      </div>
    )
  }

  const members: any[] = team.members ?? []
  const total    = members.length
  const accepted = members.filter((m) => m.status === 'ACCEPTED').length
  const pending  = members.filter((m) => m.status === 'PENDING').length
  const declined = members.filter((m) => m.status === 'DECLINED').length
  const isComplete = pending === 0 && declined === 0

  const tournament = team.tournament
  // Active players = anyone counted toward the roster cap (declined slots free up).
  const activePlayers = members.filter(
    (m) => (m.role === 'CAPTAIN' || m.role === 'PLAYER') && m.status !== 'DECLINED',
  ).length
  const maxRoster: number | null = tournament?.maxRosterSize ?? null
  const atCap = maxRoster != null && activePlayers >= maxRoster

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-custom hover:text-white mb-4"
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* Header */}
      <div className="bg-dark-light rounded-xl border border-dark-lighter p-5 mb-5">
        <div className="flex items-start gap-4">
          {team.logo
            ? <img src={team.logo} alt={team.name} className="w-14 h-14 rounded-lg object-cover" />
            : <div className="w-14 h-14 rounded-lg bg-primary/20 flex items-center justify-center font-bold text-primary-light text-xl">{team.name?.charAt(0).toUpperCase()}</div>}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{team.name}</h1>
            {tournament && (
              <p className="text-xs text-gray-custom mt-0.5">
                {tournament.name} · {tournament.status}
              </p>
            )}
            <div className="flex flex-wrap gap-3 mt-3 text-xs">
              {team.captain && (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Crown size={11} />
                  {team.captain.name}
                </span>
              )}
              {team.coach && (
                <span className="flex items-center gap-1.5 text-primary-light">
                  <Award size={11} />
                  {team.coach.name}
                </span>
              )}
            </div>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
              isComplete ? 'bg-accent/20 text-accent' : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {isComplete ? 'Complete' : `${accepted}/${total} accepted${declined ? ` · ${declined} declined` : ''}`}
          </span>
        </div>
      </div>

      {/* Roster */}
      <section className="bg-dark-light rounded-xl border border-dark-lighter p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2 mb-1">
          <Users size={16} className="text-primary-light" />
          Roster ({total})
        </h2>

        {members.map((m: any) => {
          const isCaptainRow = m.userId === team.captainId
          const isReplaceOpen = replaceTargetUserId === m.userId
          return (
            <div key={m.id} className="bg-dark rounded-lg">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <Avatar user={m.user} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.user.name}{m.userId === user?.id ? ' (you)' : ''}
                  </p>
                  <p className="text-xs text-gray-custom truncate">
                    {m.role.toLowerCase()}{m.user.position ? ` · ${m.user.position}` : ''}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[m.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                  {m.status}
                </span>

                {/* Replace — only for declined members */}
                {isCaptain && !isCaptainRow && m.status === 'DECLINED' && (
                  <button
                    onClick={() => {
                      setReplaceTargetUserId(isReplaceOpen ? null : m.userId)
                      setReplaceSearch('')
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                      isReplaceOpen
                        ? 'bg-primary text-dark font-semibold'
                        : 'text-primary-light hover:bg-primary/10'
                    }`}
                    title="Replace this member"
                  >
                    <Replace size={12} />
                    Replace
                  </button>
                )}

                {/* Remove — non-captain rows, any status (the explicit "they're out" action) */}
                {isCaptain && !isCaptainRow && (
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${m.user.name} from the team?`)) {
                        removeMutation.mutate(m.userId)
                      }
                    }}
                    disabled={removeMutation.isPending}
                    className="p-1.5 text-gray-custom hover:text-red-400 transition-colors rounded"
                    title="Remove member"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Inline replace search */}
              {isReplaceOpen && (
                <div className="px-3 pb-3 -mt-1 space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 bg-dark-light border border-primary/40 rounded-lg">
                    <Search size={13} className="text-gray-custom" />
                    <input
                      type="text"
                      autoFocus
                      value={replaceSearch}
                      onChange={(e) => setReplaceSearch(e.target.value)}
                      placeholder={`Pick a replacement for ${m.user.name}…`}
                      className="flex-1 bg-transparent text-sm text-white placeholder-gray-custom focus:outline-none"
                    />
                    <button onClick={() => setReplaceTargetUserId(null)} className="text-gray-custom hover:text-white" title="Cancel">
                      <X size={13} />
                    </button>
                  </div>
                  {debouncedReplaceSearch.trim().length >= 2 && (
                    <div className="border border-dark-lighter rounded-lg overflow-hidden divide-y divide-dark-lighter max-h-56 overflow-y-auto">
                      {replaceFetching ? (
                        <div className="px-3 py-2 text-xs text-gray-custom">Searching…</div>
                      ) : (replaceResults?.users ?? []).filter((u: UserLite) => !memberIds.includes(u.id)).length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-custom">No matching players</div>
                      ) : (
                        (replaceResults!.users as UserLite[])
                          .filter((u) => !memberIds.includes(u.id))
                          .slice(0, 6)
                          .map((u) => (
                            <button
                              key={u.id}
                              onClick={() =>
                                replaceMutation.mutate({ oldUserId: m.userId, newUserId: u.id })
                              }
                              disabled={replaceMutation.isPending}
                              className="w-full flex items-center gap-3 px-3 py-2 bg-dark-light hover:bg-dark-lighter text-left transition-colors disabled:opacity-50"
                            >
                              <Avatar user={u} size={26} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{u.name}</p>
                                <p className="text-xs text-gray-custom truncate">
                                  {u.position ? u.position : u.sport ?? ''}
                                </p>
                              </div>
                              <Replace size={13} className="text-primary" />
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Captain: add a new player (general invite, not a 1:1 replace) */}
        {isCaptain && (
          <div className="pt-3 border-t border-dark-lighter">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-xs text-gray-custom">
                Add a player to fill an empty slot.
              </p>
              {maxRoster != null && (
                <span
                  className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    atCap ? 'bg-amber-500/20 text-amber-300' : 'bg-dark text-gray-custom border border-dark-lighter'
                  }`}
                >
                  {atCap && <AlertCircle size={10} />}
                  {activePlayers} / {maxRoster}
                </span>
              )}
            </div>

            {atCap ? (
              <div className="flex items-start gap-2 px-3 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertCircle size={14} className="text-amber-300 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-200">
                  Roster is full ({maxRoster} active players). Remove someone first, or use Replace on a declined member.
                </p>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 px-3 py-2 bg-dark border border-dark-lighter rounded-lg focus-within:border-primary">
                  <Search size={14} className="text-gray-custom" />
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Search players by name…"
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-custom focus:outline-none"
                  />
                </div>
                {debouncedSearch.trim().length >= 2 && (
                  <div className="mt-2 border border-dark-lighter rounded-lg overflow-hidden divide-y divide-dark-lighter max-h-64 overflow-y-auto">
                    {searchFetching ? (
                      <div className="px-3 py-3 text-xs text-gray-custom">Searching…</div>
                    ) : (searchResults?.users ?? []).filter((u: UserLite) => !memberIds.includes(u.id)).length === 0 ? (
                      <div className="px-3 py-3 text-xs text-gray-custom">No matching players</div>
                    ) : (
                      (searchResults!.users as UserLite[])
                        .filter((u) => !memberIds.includes(u.id))
                        .slice(0, 8)
                        .map((u) => (
                          <button
                            key={u.id}
                            onClick={() => inviteMutation.mutate(u.id)}
                            disabled={inviteMutation.isPending}
                            className="w-full flex items-center gap-3 px-3 py-2 bg-dark hover:bg-dark-lighter text-left transition-colors disabled:opacity-50"
                          >
                            <Avatar user={u} size={28} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{u.name}</p>
                              <p className="text-xs text-gray-custom truncate">
                                {u.position ? u.position : u.sport ?? ''}
                              </p>
                            </div>
                            <UserPlus size={14} className="text-primary" />
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

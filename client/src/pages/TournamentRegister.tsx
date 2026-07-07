import BallLoader from '../components/BallLoader';
import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import { ArrowLeft, Search, Trophy, UserPlus, X, Users, Crown, Award, Upload, AlertCircle } from 'lucide-react'
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

function Avatar({ user, size = 32 }: { user: { name?: string; avatar?: string }; size?: number }) {
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

export default function TournamentRegister() {
  const { id: tournamentId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  const isCoachUser = user?.role === 'COACH'

  // ─── Form state ──────────────────────────────────────────────────────────
  const [teamName, setTeamName]                 = useState('')
  const [logoFile, setLogoFile]                 = useState<File | null>(null)
  const [logoPreview, setLogoPreview]           = useState<string | null>(null)
  const logoInputRef                            = useRef<HTMLInputElement>(null)
  const [playerIds, setPlayerIds]               = useState<string[]>([])
  const [playerCache, setPlayerCache]           = useState<Record<string, UserLite>>({})
  const [coachId, setCoachId]                   = useState<string | null>(null)
  const [coachCache, setCoachCache]             = useState<UserLite | null>(null)
  const [captainId, setCaptainId]               = useState<string>('')
  const [playerSearch, setPlayerSearch]         = useState('')
  const [coachSearch, setCoachSearch]           = useState('')

  const debouncedPlayerSearch = useDebounced(playerSearch, 250)
  const debouncedCoachSearch  = useDebounced(coachSearch, 250)

  // ─── Tournament ──────────────────────────────────────────────────────────
  const { data: tournamentData, isLoading: tournamentLoading } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${tournamentId}`)
      return data
    },
    enabled: !!tournamentId,
  })
  const tournament = tournamentData?.tournament

  // ─── Player search ───────────────────────────────────────────────────────
  const { data: playerResults, isFetching: playersFetching } = useQuery({
    queryKey: ['user-search-players', tournament?.sport, debouncedPlayerSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ role: 'ATHLETE', limit: '15' })
      if (tournament?.sport) params.set('sport', tournament.sport)
      if (debouncedPlayerSearch.trim()) params.set('search', debouncedPlayerSearch.trim())
      const { data } = await api.get(`/users?${params}`)
      return data
    },
    enabled: !!tournament && debouncedPlayerSearch.trim().length >= 2,
  })

  // ─── Coach search ────────────────────────────────────────────────────────
  const { data: coachResults, isFetching: coachesFetching } = useQuery({
    queryKey: ['user-search-coaches', tournament?.sport, debouncedCoachSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ role: 'COACH', limit: '10' })
      if (tournament?.sport) params.set('sport', tournament.sport)
      if (debouncedCoachSearch.trim()) params.set('search', debouncedCoachSearch.trim())
      const { data } = await api.get(`/users?${params}`)
      return data
    },
    enabled: !isCoachUser && !!tournament && !coachId && debouncedCoachSearch.trim().length >= 2,
  })

  // ─── Effective selected lists ────────────────────────────────────────────
  const selectedPlayers: UserLite[] = useMemo(
    () => playerIds.map((id) => playerCache[id]).filter(Boolean) as UserLite[],
    [playerIds, playerCache],
  )

  const min = tournament?.minRosterSize ?? null
  const max = tournament?.maxRosterSize ?? null
  const rosterCount = playerIds.length
  const atCap   = max != null && rosterCount >= max
  const overCap = max != null && rosterCount > max
  const rosterValid =
    (min == null || rosterCount >= min) &&
    (max == null || rosterCount <= max) &&
    rosterCount >= 1
  const counterColor =
    overCap   ? 'text-red-400'
    : atCap   ? 'text-amber-300'
    : rosterValid ? 'text-accent'
    : 'text-gray-custom'

  // Auto-pick captain when first player is added
  useEffect(() => {
    if (!captainId && playerIds.length > 0) setCaptainId(playerIds[0])
    if (captainId && !playerIds.includes(captainId)) setCaptainId(playerIds[0] ?? '')
  }, [playerIds, captainId])

  // ─── Handlers ────────────────────────────────────────────────────────────
  const addPlayer = (u: UserLite) => {
    if (playerIds.includes(u.id)) return
    if (max != null && playerIds.length >= max) {
      toast.error(`Maximum roster size is ${max}`)
      return
    }
    setPlayerCache((c) => ({ ...c, [u.id]: u }))
    setPlayerIds((ids) => [...ids, u.id])
    setPlayerSearch('')
  }

  const removePlayer = (id: string) => {
    setPlayerIds((ids) => ids.filter((p) => p !== id))
  }

  const addMeAsPlayer = () => {
    if (!user || isCoachUser) return
    if (playerIds.includes(user.id)) return
    addPlayer({ id: user.id, name: user.name, role: user.role, sport: user.sport, avatar: user.avatar, position: user.position })
  }

  const pickCoach = (u: UserLite) => {
    setCoachCache(u)
    setCoachId(u.id)
    setCoachSearch('')
  }

  const clearCoach = () => {
    setCoachId(null)
    setCoachCache(null)
  }

  // ─── Logo picker ─────────────────────────────────────────────────────────
  const handleLogoPick = (file: File | null) => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoFile(file)
    setLogoPreview(file ? URL.createObjectURL(file) : null)
  }

  // ─── Submit ──────────────────────────────────────────────────────────────
  const registerMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('teamName', teamName.trim())
      fd.append('captainUserId', captainId)
      // Multipart can't carry native arrays; the server unwraps JSON-stringified strings.
      fd.append('playerUserIds', JSON.stringify(playerIds))
      // Server auto-assigns the coach when creator.role === 'COACH'; only send coachUserId for non-coach creators.
      if (!isCoachUser && coachId) fd.append('coachUserId', coachId)
      if (logoFile) fd.append('logo', logoFile)
      const { data } = await api.post(`/tournaments/${tournamentId}/register`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tournaments'] })
      qc.invalidateQueries({ queryKey: ['tournament', tournamentId] })
      toast.success(data?.message ?? 'Registration submitted')
      navigate('/tournaments')
    },
    onError: (err: any) => {
      const details = err.response?.data?.details
      toast.error(Array.isArray(details) && details[0] ? details[0] : err.response?.data?.error || 'Registration failed')
    },
  })

  const canSubmit =
    !!teamName.trim() &&
    rosterValid &&
    !!captainId &&
    playerIds.includes(captainId) &&
    !registerMutation.isPending

  // ─── Guards ──────────────────────────────────────────────────────────────
  if (tournamentLoading) {
    return (
      <div className="flex justify-center py-16">
        <BallLoader />
      </div>
    )
  }
  if (!tournament) {
    return (
      <div className="bg-card rounded-xl border border-line p-12 text-center">
        <p className="text-gray-custom">Tournament not found.</p>
      </div>
    )
  }
  if (tournament.format === 'INDIVIDUAL') {
    return (
      <div className="bg-card rounded-xl border border-line p-12 text-center">
        <p className="text-gray-custom">This tournament uses individual entry — team registration isn't available.</p>
      </div>
    )
  }
  if (!['UPCOMING', 'REGISTRATION_OPEN'].includes(tournament.status)) {
    return (
      <div className="bg-card rounded-xl border border-line p-12 text-center">
        <p className="text-gray-custom">Registration is closed for this tournament.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* Header */}
      <button
        onClick={() => navigate('/tournaments')}
        className="flex items-center gap-1.5 text-sm text-gray-custom hover:text-foreground mb-4"
      >
        <ArrowLeft size={14} /> Back to tournaments
      </button>

      <div className="flex items-start gap-3 mb-6">
        <Trophy size={22} className="text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Register for {tournament.name}</h1>
          <p className="text-sm text-gray-custom mt-0.5">
            {tournament.sport} · {tournament.format === 'DOUBLES' ? 'Doubles' : 'Team'} format
            {min || max ? ` · Roster ${min ?? '?'}–${max ?? '?'}` : ''}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* ── Team identity ─────────────────────────────────────────────── */}
        <section className="bg-card rounded-xl border border-line p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Users size={16} className="text-primary-light" />
            Team
          </h2>

          <div className="flex items-start gap-4">
            {/* Logo picker */}
            <div>
              <label className="block text-xs text-gray-custom mb-1.5">Logo</label>
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-line hover:border-primary/60 flex items-center justify-center overflow-hidden bg-surface transition-colors"
              >
                {logoPreview
                  ? <img src={logoPreview} alt="logo" className="w-full h-full object-cover" />
                  : <Upload size={18} className="text-gray-custom" />}
              </button>
              {logoFile && (
                <button
                  type="button"
                  onClick={() => handleLogoPick(null)}
                  className="mt-1 text-[10px] text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  handleLogoPick(f)
                  e.target.value = ''
                }}
              />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <label className="block text-xs text-gray-custom mb-1.5">Team name</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={50}
                placeholder="e.g. Mumbai Strikers"
                className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground placeholder-gray-custom focus:outline-none focus:border-primary"
              />
              <p className="mt-1.5 text-[10px] text-gray-custom">Optional logo — JPG, PNG, or WebP up to 2 MB.</p>
            </div>
          </div>
        </section>

        {/* ── Coach ─────────────────────────────────────────────────────── */}
        <section className="bg-card rounded-xl border border-line p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Award size={16} className="text-primary-light" />
            Coach {isCoachUser ? '' : <span className="text-xs text-gray-custom font-normal">(optional)</span>}
          </h2>

          {isCoachUser ? (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-surface rounded-lg">
              <Avatar user={user!} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user!.name} (you)</p>
                <p className="text-xs text-gray-custom">Registering as coach</p>
              </div>
            </div>
          ) : coachId && coachCache ? (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-surface rounded-lg">
              <Avatar user={coachCache} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{coachCache.name}</p>
                {coachCache.position && <p className="text-xs text-gray-custom">{coachCache.position}</p>}
              </div>
              <button onClick={clearCoach} className="p-1 text-gray-custom hover:text-red-400" aria-label="Remove coach">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2 bg-surface border border-line rounded-lg focus-within:border-primary">
                <Search size={14} className="text-gray-custom" />
                <input
                  type="text"
                  value={coachSearch}
                  onChange={(e) => setCoachSearch(e.target.value)}
                  placeholder="Search by coach name…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder-gray-custom focus:outline-none"
                />
              </div>
              {debouncedCoachSearch.trim().length >= 2 && (
                <div className="mt-2 border border-line rounded-lg overflow-hidden divide-y divide-line">
                  {coachesFetching ? (
                    <div className="px-3 py-3 text-xs text-gray-custom">Searching…</div>
                  ) : (coachResults?.users ?? []).length === 0 ? (
                    <div className="px-3 py-3 text-xs text-gray-custom">No coaches found</div>
                  ) : (
                    coachResults.users.slice(0, 6).map((u: UserLite) => (
                      <button
                        key={u.id}
                        onClick={() => pickCoach(u)}
                        className="w-full flex items-center gap-3 px-3 py-2 bg-surface hover:bg-elevated text-left transition-colors"
                      >
                        <Avatar user={u} size={28} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-xs text-gray-custom truncate">{u.sport ?? ''}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Roster ────────────────────────────────────────────────────── */}
        <section className="bg-card rounded-xl border border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <UserPlus size={16} className="text-primary-light" />
              Players
            </h2>
            <span className={`flex items-center gap-1 text-xs font-medium ${counterColor}`}>
              {(atCap || overCap) && <AlertCircle size={11} />}
              {rosterCount}
              {min || max ? ` / ${min ?? '?'}–${max ?? '?'}` : ''}
            </span>
          </div>

          {atCap && !overCap && (
            <div className="flex items-start gap-2 px-3 py-2.5 mb-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertCircle size={13} className="text-amber-300 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200">
                Roster is at the maximum of {max}. Remove a player to add someone else.
              </p>
            </div>
          )}

          {/* Add me */}
          {!isCoachUser && user && !playerIds.includes(user.id) && (
            <button
              onClick={addMeAsPlayer}
              disabled={atCap}
              className="w-full flex items-center gap-3 px-3 py-2 mb-3 bg-surface hover:bg-elevated disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-dashed border-line transition-colors"
            >
              <Avatar user={user} size={28} />
              <span className="text-sm">Add me as a player</span>
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 bg-surface border border-line rounded-lg focus-within:border-primary">
              <Search size={14} className="text-gray-custom" />
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search players by name…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder-gray-custom focus:outline-none"
              />
            </div>
            {debouncedPlayerSearch.trim().length >= 2 && (
              <div className="mt-2 border border-line rounded-lg overflow-hidden divide-y divide-line max-h-72 overflow-y-auto">
                {atCap ? (
                  <div className="px-3 py-3 text-xs text-amber-300 flex items-center gap-2">
                    <AlertCircle size={12} />
                    Roster full — remove a player before adding another.
                  </div>
                ) : playersFetching ? (
                  <div className="px-3 py-3 text-xs text-gray-custom">Searching…</div>
                ) : (playerResults?.users ?? []).filter((u: UserLite) => !playerIds.includes(u.id)).length === 0 ? (
                  <div className="px-3 py-3 text-xs text-gray-custom">No matching players</div>
                ) : (
                  (playerResults!.users as UserLite[])
                    .filter((u) => !playerIds.includes(u.id))
                    .slice(0, 8)
                    .map((u) => (
                      <button
                        key={u.id}
                        onClick={() => addPlayer(u)}
                        className="w-full flex items-center gap-3 px-3 py-2 bg-surface hover:bg-elevated text-left transition-colors"
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

          {/* Selected players */}
          {selectedPlayers.length > 0 && (
            <div className="mt-4 space-y-2">
              {selectedPlayers.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-surface rounded-lg">
                  <Avatar user={p} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {p.name}{p.id === user?.id ? ' (you)' : ''}
                    </p>
                    {p.position && <p className="text-xs text-gray-custom truncate">{p.position}</p>}
                  </div>
                  {p.id === captainId && (
                    <span className="flex items-center gap-1 text-xs text-amber-400">
                      <Crown size={12} /> Captain
                    </span>
                  )}
                  <button
                    onClick={() => removePlayer(p.id)}
                    className="p-1 text-gray-custom hover:text-red-400"
                    aria-label="Remove player"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Captain ───────────────────────────────────────────────────── */}
        {selectedPlayers.length > 0 && (
          <section className="bg-card rounded-xl border border-line p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Crown size={16} className="text-amber-400" />
              Captain
            </h2>
            <select
              value={captainId}
              onChange={(e) => setCaptainId(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            >
              {selectedPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.id === user?.id ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </section>
        )}

        {/* ── Submit ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-gray-custom">
            Invites are sent to every member you add. Registration completes once everyone accepts.
          </p>
          <button
            onClick={() => registerMutation.mutate()}
            disabled={!canSubmit}
            className="px-6 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-on-primary font-semibold text-sm rounded-lg transition-colors"
          >
            {registerMutation.isPending ? 'Submitting…' : 'Submit registration'}
          </button>
        </div>
      </div>
    </div>
  )
}

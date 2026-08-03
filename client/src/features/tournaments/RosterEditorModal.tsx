import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Crown, UserPlus, Trash2, AlertTriangle, Search } from 'lucide-react';
import api from '../../api/client';

interface Member { userId: string; role: string; status: string; user: { id: string; name: string; position?: string | null } }
interface Team { id: string; name: string; captainId: string; members: Member[] }

const STATUS = {
  ACCEPTED: 'bg-accent/20 text-accent',
  PENDING: 'bg-amber-500/20 text-amber-300',
  DECLINED: 'bg-red-500/20 text-red-400',
} as Record<string, string>;

const EMPTY_NEW = { name: '', email: '', dateOfBirth: '', gender: '', position: '', guardianEmail: '' };
type NewPlayer = typeof EMPTY_NEW;

function ageFromDateString(s: string): number | null {
  if (!s) return null;
  const dob = new Date(s);
  if (Number.isNaN(dob.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - dob.getFullYear();
  const m = t.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < dob.getDate())) a--;
  return a;
}

/** Admin roster editor: add/remove players directly (ACCEPTED, no invite dance),
 *  and clearly surface members who haven't accepted — they're excluded from the
 *  draw. */
export default function RosterEditorModal({
  tournamentId, team, onClose,
}: {
  tournamentId: string;
  team: Team;
  /** Kept for call-site compatibility; the tournament's sport is now applied server-side. */
  sport?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-tournament-registrations', tournamentId] });
    qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
  };

  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [np, setNp] = useState<NewPlayer>(EMPTY_NEW);
  // Matching records returned when the server flags a likely duplicate at creation.
  const [dupMatches, setDupMatches] = useState<Array<{ id: string; name: string; email: string; role: string }> | null>(null);
  const npAge = ageFromDateString(np.dateOfBirth);
  const npUnder13 = npAge !== null && npAge < 13;
  const npValid = !!(np.name.trim() && np.email.trim() && np.dateOfBirth && np.gender && (!npUnder13 || np.guardianEmail.trim()));
  const setNpField = (patch: Partial<NewPlayer>) => setNp((v) => ({ ...v, ...patch }));

  const [search, setSearch] = useState('');
  const { data: results } = useQuery({
    // Roster search: finds ANY rosterable player on the platform by name —
    // provisioned or self-registered, signed in or not, discoverable or not,
    // including minors — because an organiser is building a roster, not browsing.
    // Gated server-side by tournament access (see services/rosterSearch).
    queryKey: ['roster-player-search', tournamentId, search],
    queryFn: async () => {
      const p = new URLSearchParams({ q: search.trim() });
      return (await api.get(`/tournaments/${tournamentId}/player-search?${p}`)).data.players as { id: string; name: string; position?: string }[];
    },
    enabled: search.trim().length > 1,
  });

  const add = useMutation({
    mutationFn: (userId: string) => api.post(`/tournaments/${tournamentId}/teams/${team.id}/members`, { userId }),
    onSuccess: () => { toast.success('Player added'); setSearch(''); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Could not add player'),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.delete(`/tournaments/${tournamentId}/teams/${team.id}/members/${userId}`),
    onSuccess: () => { toast.success('Player removed'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Could not remove player'),
  });
  const createPlayer = useMutation({
    mutationFn: (allowDuplicate: boolean) => api.post(`/tournaments/${tournamentId}/teams/${team.id}/members/provision`, {
      name: np.name.trim(),
      email: np.email.trim(),
      dateOfBirth: np.dateOfBirth,
      gender: np.gender,
      position: np.position.trim() || undefined,
      guardianEmail: npUnder13 ? np.guardianEmail.trim() : undefined,
      ...(allowDuplicate && { allowDuplicate: true }),
    }),
    onSuccess: (res: any) => {
      const { created, guardianConsentPending } = res.data ?? {};
      toast.success(
        guardianConsentPending ? 'Added — guardian consent email sent'
        : created ? 'Player created & added'
        : 'Existing account added to team',
      );
      setDupMatches(null);
      setNp(EMPTY_NEW);
      setMode('search');
      invalidate();
    },
    onError: (e: any) => {
      // A likely-duplicate: surface the matches and let the organiser decide,
      // rather than silently creating a second row for the same person.
      if (e.response?.status === 409 && e.response?.data?.code === 'DUPLICATE_WARNING') {
        setDupMatches(e.response.data.matches ?? []);
        return;
      }
      toast.error(e.response?.data?.error || 'Could not create player');
    },
  });

  const existing = new Set(team.members.map((m) => m.userId));
  const pending = team.members.filter((m) => m.status !== 'ACCEPTED');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-custom">Roster</p>
            <h3 className="font-semibold truncate">{team.name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {pending.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{pending.length} player{pending.length > 1 ? 's' : ''} haven't accepted yet — they <span className="font-semibold">won't be included</span> when you generate the draw. Add them directly below to accept on their behalf.</span>
            </div>
          )}

          <ul className="space-y-2">
            {team.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2">
                <span className="text-sm flex-1 min-w-0 truncate flex items-center gap-1.5">
                  {m.userId === team.captainId && <Crown size={12} className="text-primary shrink-0" />}
                  {m.user.name}
                  {m.user.position && <span className="text-xs text-gray-custom">· {m.user.position}</span>}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS[m.status] ?? 'bg-elevated text-gray-custom'}`}>{m.status}</span>
                {m.userId !== team.captainId && (
                  <button onClick={() => remove.mutate(m.userId)} disabled={remove.isPending} className="p-1.5 rounded-lg text-gray-custom hover:text-red-400 hover:bg-elevated transition-colors disabled:opacity-50" title="Remove">
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* Add player — search an existing user, or create a brand-new one */}
          <div className="space-y-3 pt-2 border-t border-line">
            <p className="text-xs uppercase tracking-wide text-gray-custom flex items-center gap-1.5"><UserPlus size={13} /> Add a player</p>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-surface border border-line rounded-lg text-xs font-medium">
              <button
                onClick={() => setMode('search')}
                className={`py-1.5 rounded-md transition-colors ${mode === 'search' ? 'bg-elevated text-foreground' : 'text-gray-custom hover:text-foreground'}`}
              >
                Search existing
              </button>
              <button
                onClick={() => setMode('create')}
                className={`py-1.5 rounded-md transition-colors ${mode === 'create' ? 'bg-elevated text-foreground' : 'text-gray-custom hover:text-foreground'}`}
              >
                Create new player
              </button>
            </div>

            {mode === 'search' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search players by name…"
                    className="w-full pl-9 pr-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                {search.trim().length > 1 && (
                  <div className="border border-line rounded-lg divide-y divide-line max-h-40 overflow-y-auto">
                    {(results ?? []).filter((u) => !existing.has(u.id)).length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-custom">No matching players. Switch to <button onClick={() => setMode('create')} className="text-primary hover:underline">Create new player</button>.</p>
                    ) : (results ?? []).filter((u) => !existing.has(u.id)).map((u) => (
                      <button key={u.id} onClick={() => add.mutate(u.id)} disabled={add.isPending} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface transition-colors disabled:opacity-50">
                        <span className="truncate">{u.name}{u.position && <span className="text-xs text-gray-custom"> · {u.position}</span>}</span>
                        <UserPlus size={13} className="text-primary shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text" value={np.name} maxLength={80} placeholder="Full name"
                    onChange={(e) => setNpField({ name: e.target.value })}
                    className="px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
                  />
                  <input
                    type="email" value={np.email} maxLength={254} placeholder="Email (login)"
                    onChange={(e) => setNpField({ email: e.target.value })}
                    className="px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-gray-custom mb-1">Date of birth</label>
                    <input
                      type="date" value={np.dateOfBirth}
                      onChange={(e) => setNpField({ dateOfBirth: e.target.value })}
                      className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-custom mb-1">Category</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['MALE', 'FEMALE'] as const).map((g) => (
                        <button
                          key={g} type="button" onClick={() => setNpField({ gender: g })}
                          className={`py-2 rounded-lg text-xs font-medium border transition-colors ${np.gender === g ? 'bg-primary/15 border-primary/50 text-primary' : 'bg-surface border-line text-gray-custom hover:text-foreground'}`}
                        >
                          {g === 'MALE' ? "Men's" : "Women's"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <input
                  type="text" value={np.position} maxLength={60} placeholder="Position (optional)"
                  onChange={(e) => setNpField({ position: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
                />
                {npUnder13 && (
                  <div>
                    <label className="block text-[11px] text-amber-300 mb-1">Guardian email (required · under 13)</label>
                    <input
                      type="email" value={np.guardianEmail} maxLength={254} placeholder="parent@example.com"
                      onChange={(e) => setNpField({ guardianEmail: e.target.value })}
                      className="w-full px-3 py-2 bg-surface border border-amber-500/40 rounded-lg text-sm focus:outline-none focus:border-amber-400 placeholder-gray-custom"
                    />
                    <p className="text-[11px] text-amber-300/80 mt-1.5">
                      Under-13: the profile stays private and a guardian-consent email is sent. The account activates once the guardian consents.
                    </p>
                  </div>
                )}
                {dupMatches && (
                  <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs space-y-2">
                    <p className="flex items-start gap-1.5 text-amber-200 font-medium">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      A profile with matching details already exists:
                    </p>
                    <ul className="space-y-1 pl-5">
                      {dupMatches.map((m) => (
                        <li key={m.id} className="text-amber-100/90">
                          <span className="font-medium">{m.name}</span> · {m.email} · {m.role.toLowerCase()}
                        </li>
                      ))}
                    </ul>
                    <p className="text-amber-100/70">Add this person again only if they're genuinely a different individual.</p>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => createPlayer.mutate(true)} disabled={createPlayer.isPending}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold disabled:opacity-50">
                        {createPlayer.isPending ? 'Creating…' : 'Create anyway'}
                      </button>
                      <button onClick={() => setDupMatches(null)} disabled={createPlayer.isPending}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-line text-gray-custom hover:text-foreground">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {!dupMatches && (
                <button
                  onClick={() => createPlayer.mutate(false)}
                  disabled={!npValid || createPlayer.isPending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-on-primary transition-colors disabled:opacity-50"
                >
                  <UserPlus size={14} /> {createPlayer.isPending ? 'Creating…' : 'Create & add to team'}
                </button>
                )}
                <p className="text-[11px] text-gray-custom">Creates an account in this tournament's sport and adds them as accepted — no invite needed. An existing account with this email is added, not duplicated.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-line">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-elevated transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

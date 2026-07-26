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

/** Admin roster editor: add/remove players directly (ACCEPTED, no invite dance),
 *  and clearly surface members who haven't accepted — they're excluded from the
 *  draw. */
export default function RosterEditorModal({
  tournamentId, team, sport, onClose,
}: {
  tournamentId: string;
  team: Team;
  sport?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-tournament-registrations', tournamentId] });
    qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
  };

  const [search, setSearch] = useState('');
  const { data: results } = useQuery({
    queryKey: ['user-search-roster', sport, search],
    queryFn: async () => {
      const p = new URLSearchParams({ role: 'ATHLETE', limit: '8' });
      if (sport) p.set('sport', sport);
      if (search.trim()) p.set('search', search.trim());
      return (await api.get(`/users?${p}`)).data.users as { id: string; name: string; position?: string }[];
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

          {/* Add player */}
          <div className="space-y-2 pt-2 border-t border-line">
            <p className="text-xs uppercase tracking-wide text-gray-custom flex items-center gap-1.5"><UserPlus size={13} /> Add a player</p>
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
                  <p className="px-3 py-2 text-xs text-gray-custom">No matching players.</p>
                ) : (results ?? []).filter((u) => !existing.has(u.id)).map((u) => (
                  <button key={u.id} onClick={() => add.mutate(u.id)} disabled={add.isPending} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface transition-colors disabled:opacity-50">
                    <span className="truncate">{u.name}{u.position && <span className="text-xs text-gray-custom"> · {u.position}</span>}</span>
                    <UserPlus size={13} className="text-primary shrink-0" />
                  </button>
                ))}
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

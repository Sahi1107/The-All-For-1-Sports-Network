import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Crown, UserPlus, Search, Trash2 } from 'lucide-react';
import api from '../../api/client';

interface Lite { id: string; name: string; position?: string }

/** Admin: create a team directly with an all-accepted roster (late entry). */
export default function AddTeamModal({
  tournamentId, onClose,
}: {
  tournamentId: string;
  /** Accepted for call-site compatibility; roster search is no longer sport-filtered. */
  sport?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState<Lite[]>([]);
  const [captainId, setCaptainId] = useState('');
  const [search, setSearch] = useState('');

  const { data: results } = useQuery({
    // Same scoped roster search as RosterEditorModal — finds ANY rosterable player
    // on the platform (provisioned or self-registered, discoverable or not, incl.
    // minors), gated server-side by tournament access. NOT the public /users
    // search, whose discovery gate hid provisioned / non-discoverable / minor
    // players an organiser legitimately needs to roster.
    queryKey: ['roster-player-search-addteam', tournamentId, search],
    queryFn: async () => {
      const p = new URLSearchParams({ q: search.trim() });
      return (await api.get(`/tournaments/${tournamentId}/player-search?${p}`)).data.players as Lite[];
    },
    enabled: search.trim().length > 1,
  });

  const addPlayer = (u: Lite) => {
    if (players.some((p) => p.id === u.id)) return;
    setPlayers((ps) => [...ps, u]);
    if (!captainId) setCaptainId(u.id);
    setSearch('');
  };
  const removePlayer = (id: string) => {
    setPlayers((ps) => ps.filter((p) => p.id !== id));
    if (captainId === id) setCaptainId((c) => (c === id ? (players.find((p) => p.id !== id)?.id ?? '') : c));
  };

  const create = useMutation({
    mutationFn: () => api.post(`/tournaments/${tournamentId}/teams`, {
      teamName: teamName.trim(), captainUserId: captainId, playerUserIds: players.map((p) => p.id),
    }),
    onSuccess: () => {
      toast.success('Team added');
      qc.invalidateQueries({ queryKey: ['admin-tournament-registrations', tournamentId] });
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Could not create team'),
  });

  const valid = teamName.trim() && players.length > 0 && captainId;
  const existing = new Set(players.map((p) => p.id));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h3 className="font-semibold">Add a team</h3>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <label className="block">
            <span className="block text-xs text-gray-custom mb-1.5">Team name</span>
            <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Riverside FC"
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary" />
          </label>

          {players.length > 0 && (
            <ul className="space-y-1.5">
              {players.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <button onClick={() => setCaptainId(p.id)} title="Make captain"
                    className={`p-1 rounded ${captainId === p.id ? 'text-primary' : 'text-gray-custom hover:text-foreground'}`}>
                    <Crown size={14} />
                  </button>
                  <span className="flex-1 min-w-0 truncate">{p.name}{captainId === p.id && <span className="text-xs text-primary"> · captain</span>}</span>
                  <button onClick={() => removePlayer(p.id)} className="p-1.5 rounded-lg text-gray-custom hover:text-red-400 hover:bg-elevated transition-colors"><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players to add…"
                className="w-full pl-9 pr-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary" />
            </div>
            {search.trim().length > 1 && (
              <div className="border border-line rounded-lg divide-y divide-line max-h-40 overflow-y-auto">
                {(results ?? []).filter((u) => !existing.has(u.id)).length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-custom">No matching players.</p>
                ) : (results ?? []).filter((u) => !existing.has(u.id)).map((u) => (
                  <button key={u.id} onClick={() => addPlayer(u)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface transition-colors">
                    <span className="truncate">{u.name}{u.position && <span className="text-xs text-gray-custom"> · {u.position}</span>}</span>
                    <UserPlus size={13} className="text-primary shrink-0" />
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-custom">Players are added as accepted — no invite needed. Tap the crown to set the captain.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
          <button onClick={onClose} disabled={create.isPending} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-elevated transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!valid || create.isPending} className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-on-primary transition-colors disabled:opacity-50">
            {create.isPending ? 'Adding…' : 'Add team'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, UserMinus, Plus } from 'lucide-react';
import api from '../../../api/client';
import type { TrackerSession } from '../types';
import { unassignedTeamIds } from '../../tournaments/manageGate';

interface G { id: string; name: string; teamIds: string[] }

/** Admin group editor: rename groups, move teams between them, add unassigned
 *  (incl. late-registered) teams, and withdraw a team. A group that already has
 *  results CAN be restructured: the server re-plans only the fixtures that
 *  haven't been played, so results are preserved. A team that has already played
 *  in a group can't be moved out of it — its result belongs to that table. */
export default function GroupEditor({ session, onClose }: { session: TrackerSession; onClose: () => void }) {
  const qc = useQueryClient();
  const tid = session.tournamentId;

  const { data: tour } = useQuery({
    queryKey: ['tournament', tid],
    queryFn: async () => (await api.get(`/tournaments/${tid}`)).data.tournament,
  });
  const registered: { id: string; name: string }[] = (tour?.teams ?? []).map((t: any) => ({ id: t.team.id, name: t.team.name }));
  const nameOf = (id: string) =>
    registered.find((t) => t.id === id)?.name ?? (session.roster ?? []).find((r) => r.teamId === id)?.name ?? 'Team';

  const [groups, setGroups] = useState<G[]>(() =>
    (session.groups ?? []).map((g) => ({ id: g.id, name: g.name, teamIds: [...g.teamIds] })),
  );

  // Registered teams not in any group — the late entries that must stay
  // actionable (add to a group here, or reset the draw). One shared definition.
  const unassignedIds = new Set(unassignedTeamIds(registered.map((t) => t.id), groups));
  const unassigned = registered.filter((t) => unassignedIds.has(t.id));

  const rename = (gid: string, name: string) => setGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, name } : g)));
  const moveTo = (teamId: string, toGid: string) =>
    setGroups((gs) => gs.map((g) => ({
      ...g,
      teamIds: g.id === toGid ? [...g.teamIds.filter((t) => t !== teamId), teamId] : g.teamIds.filter((t) => t !== teamId),
    })));
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tracker-session', tid] });

  const save = useMutation({
    mutationFn: () => api.patch(`/tracker/sessions/${tid}/groups`, { groups }),
    onSuccess: (res: { data?: { fixturesAdded?: number; fixturesRemoved?: number } }) => {
      // Nothing played is ever touched, so the only news is what changed in the
      // fixture list — worth saying, because adding a team silently generates
      // several new matches.
      const added = res?.data?.fixturesAdded ?? 0;
      const removed = res?.data?.fixturesRemoved ?? 0;
      const bits = [
        added ? `${added} fixture${added === 1 ? '' : 's'} added` : '',
        removed ? `${removed} removed` : '',
      ].filter(Boolean);
      toast.success(bits.length ? `Groups updated — ${bits.join(', ')}` : 'Groups updated');
      invalidate(); onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Could not save groups'),
  });
  const withdraw = useMutation({
    mutationFn: (teamId: string) => api.post(`/tracker/sessions/${tid}/withdraw`, { teamId }),
    onSuccess: (res: any) => {
      toast.success(res.data.mode === 'forfeit' ? 'Withdrawn — remaining matches forfeited to opponents' : 'Team withdrawn');
      invalidate(); onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Could not withdraw team'),
  });
  const busy = save.isPending || withdraw.isPending;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h3 className="font-semibold">Edit groups</h3>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {groups.map((g) => (
            <div key={g.id} className="bg-surface rounded-xl border border-line p-4 space-y-3">
              <input
                value={g.name}
                onChange={(e) => rename(g.id, e.target.value)}
                className="w-full bg-transparent text-sm font-semibold focus:outline-none border-b border-transparent focus:border-line pb-1"
              />
              {g.teamIds.length === 0 ? (
                <p className="text-xs text-gray-custom italic">No teams — add one below.</p>
              ) : (
                <ul className="space-y-2">
                  {g.teamIds.map((teamId) => (
                    <li key={teamId} className="flex items-center gap-2">
                      <span className="text-sm flex-1 min-w-0 truncate">{nameOf(teamId)}</span>
                      <select
                        value={g.id}
                        onChange={(e) => moveTo(teamId, e.target.value)}
                        className="text-xs bg-card border border-line rounded-lg px-2 py-1 focus:outline-none focus:border-primary"
                        title="Move to group"
                      >
                        {groups.map((gg) => <option key={gg.id} value={gg.id}>{gg.name}</option>)}
                      </select>
                      <button
                        onClick={() => { if (confirm(`Withdraw ${nameOf(teamId)} from the tournament? Its remaining matches will be forfeited to opponents (or removed if none have started).`)) withdraw.mutate(teamId); }}
                        disabled={busy}
                        className="p-1.5 rounded-lg text-gray-custom hover:text-red-400 hover:bg-elevated transition-colors disabled:opacity-50"
                        title="Withdraw team"
                      >
                        <UserMinus size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {unassigned.length > 0 && (
            <div className="bg-surface rounded-xl border border-amber-500/30 p-4 space-y-2">
              <p className="text-xs font-medium text-amber-300 flex items-center gap-1.5"><Plus size={13} /> Unassigned teams ({unassigned.length})</p>
              {unassigned.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="text-sm flex-1 min-w-0 truncate">{t.name}</span>
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && moveTo(t.id, e.target.value)}
                    className="text-xs bg-card border border-line rounded-lg px-2 py-1 focus:outline-none focus:border-primary"
                  >
                    <option value="" disabled>Add to…</option>
                    {groups.map((gg) => <option key={gg.id} value={gg.id}>{gg.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-line">
          <p className="text-[11px] text-gray-custom">Only fixtures that haven't been played are re-planned — results are kept.</p>
          <div className="flex gap-2 shrink-0">
            <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-elevated transition-colors disabled:opacity-50">Cancel</button>
            <button onClick={() => save.mutate()} disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-on-primary transition-colors disabled:opacity-50">
              {save.isPending ? 'Saving…' : 'Save groups'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

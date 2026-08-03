import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import api from '../../api/client';

interface Impact {
  name: string; status: string;
  teams: number; registrations: number; matches: number; publishedMatches: number;
  statRows: number; playersAffected: number; rankings: number; organizers: number;
  hasPublishedData: boolean;
}

/**
 * Deletion confirmation that spells out exactly what will be destroyed. When the
 * tournament has published results (real athlete data on verified Performance
 * Cards), it additionally requires the exact name typed — deleting is the one
 * action that can erase verified records, so it must be deliberate.
 */
export default function DeleteTournamentModal({
  tournamentId, tournamentName, onClose, onDeleted,
}: {
  tournamentId: string; tournamentName: string; onClose: () => void; onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [confirmName, setConfirmName] = useState('');

  const { data: impact, isLoading } = useQuery<Impact>({
    queryKey: ['delete-impact', tournamentId],
    queryFn: async () => (await api.get(`/tournaments/${tournamentId}/delete-impact`)).data.impact,
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/tournaments/${tournamentId}`, { data: { confirmName } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
      toast.success('Tournament deleted');
      onDeleted?.();
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Delete failed'),
  });

  const needsName = impact?.hasPublishedData === true;
  const nameOk = !needsName || confirmName.trim() === impact?.name;

  const rows: Array<[string, number]> = impact ? [
    ['Teams', impact.teams],
    ['Registrations', impact.registrations],
    ['Matches', impact.matches],
    ['Published results', impact.publishedMatches],
    ['Stat lines removed', impact.statRows],
    ['Athletes affected', impact.playersAffected],
    ['Ranking entries', impact.rankings],
    ['Organiser assignments', impact.organizers],
  ] : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center shrink-0"><Trash2 size={14} /></span>
            <h3 className="font-semibold truncate">Delete tournament</h3>
          </div>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-gray-custom">
            Permanently delete <span className="text-foreground font-medium">{tournamentName}</span> and everything derived from it. This cannot be undone.
          </p>

          {isLoading ? (
            <div className="h-24 rounded-lg bg-surface border border-line animate-pulse" />
          ) : impact ? (
            <>
              <div className="rounded-lg border border-line bg-surface divide-y divide-line">
                {rows.map(([label, n]) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-gray-custom">{label}</span>
                    <span className={`font-numeric tabular-nums font-semibold ${n > 0 ? 'text-foreground' : 'text-foreground/30'}`}>{n}</span>
                  </div>
                ))}
              </div>

              {impact.hasPublishedData && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    This tournament has <span className="font-semibold">published results</span>. Deleting removes {impact.statRows} verified stat line{impact.statRows === 1 ? '' : 's'} from {impact.playersAffected} athlete{impact.playersAffected === 1 ? '' : 's'}’ Performance Cards. Type the tournament’s exact name to confirm.
                  </span>
                </div>
              )}

              {needsName && (
                <input
                  autoFocus
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={impact.name}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:border-red-400 focus:outline-none"
                />
              )}
            </>
          ) : (
            <p className="text-sm text-red-400">Couldn’t load what would be deleted.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
          <button onClick={onClose} disabled={del.isPending} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-elevated transition-colors disabled:opacity-50">Cancel</button>
          <button
            onClick={() => del.mutate()}
            disabled={!impact || !nameOk || del.isPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-40"
          >
            {del.isPending ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

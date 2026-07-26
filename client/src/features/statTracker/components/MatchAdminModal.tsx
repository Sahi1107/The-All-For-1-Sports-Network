import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Users, Flag, Undo2 } from 'lucide-react';
import api from '../../../api/client';
import type { TrackerSession, TrackerMatch } from '../types';

/** Admin match controls: reassign teams (fix a wrong/null-opponent match),
 *  declare a walkover (no-show → winner without faking a game), and un-publish a
 *  published result so it can be corrected. */
export default function MatchAdminModal({
  session, match, onClose,
}: {
  session: TrackerSession;
  match: TrackerMatch;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tracker-session', session.tournamentId] });
  const teams = (session.roster ?? []).map((t) => ({ id: t.teamId, name: t.name }));
  const nameOf = (id: string | null) => teams.find((t) => t.id === id)?.name ?? 'TBD';

  const [home, setHome] = useState<string>(match.homeTeamId ?? '');
  const [away, setAway] = useState<string>(match.awayTeamId ?? '');
  const published = match.status === 'PUBLISHED';

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/tracker/matches/${match.id}`, body),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Update failed'),
  });
  const unpublish = useMutation({
    mutationFn: () => api.post(`/tracker/matches/${match.id}/unpublish`),
    onSuccess: () => { toast.success('Un-published — now editable'); invalidate(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Un-publish failed'),
  });

  const saveTeams = () =>
    patch.mutate(
      { homeTeamId: home || null, awayTeamId: away || null },
      { onSuccess: () => { toast.success('Teams updated'); invalidate(); onClose(); } },
    );
  const walkover = (winner: 'home' | 'away') =>
    patch.mutate(
      { homeScore: winner === 'home' ? 1 : 0, awayScore: winner === 'away' ? 1 : 0, status: 'COMPLETED' },
      { onSuccess: () => { toast.success('Walkover recorded'); invalidate(); onClose(); } },
    );

  const busy = patch.isPending || unpublish.isPending;
  const bothTeams = !!home && !!away && home !== away;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-custom">{match.round || match.stage}</p>
            <h3 className="font-semibold">Manage match</h3>
          </div>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        {published ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-custom">
              <span className="text-foreground font-medium">{nameOf(match.homeTeamId)}</span> vs{' '}
              <span className="text-foreground font-medium">{nameOf(match.awayTeamId)}</span> is published to profiles.
              Un-publish to correct the result or its player stats, then re-publish from the tracker.
            </p>
            <button
              onClick={() => unpublish.mutate()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-elevated hover:bg-surface border border-line text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Undo2 size={15} /> {unpublish.isPending ? 'Un-publishing…' : 'Un-publish result'}
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {/* Reassign teams */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-wide text-gray-custom flex items-center gap-1.5"><Users size={13} /> Teams</h4>
              <div className="grid grid-cols-2 gap-3">
                <TeamSelect label="Home" value={home} teams={teams} exclude={away} onChange={setHome} />
                <TeamSelect label="Away" value={away} teams={teams} exclude={home} onChange={setAway} />
              </div>
              <button
                onClick={saveTeams}
                disabled={busy || (home === (match.homeTeamId ?? '') && away === (match.awayTeamId ?? ''))}
                className="w-full py-2 rounded-lg bg-primary hover:bg-primary-dark text-on-primary text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Save teams
              </button>
            </div>

            {/* Walkover */}
            <div className="space-y-3 pt-1 border-t border-line">
              <h4 className="text-xs uppercase tracking-wide text-gray-custom flex items-center gap-1.5 pt-4"><Flag size={13} /> Walkover / forfeit</h4>
              {bothTeams ? (
                <>
                  <p className="text-xs text-gray-custom">Record a win for the team that showed up — no need to track a game.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => walkover('home')} disabled={busy} className="py-2 rounded-lg bg-elevated hover:bg-surface border border-line text-sm transition-colors disabled:opacity-50">
                      {nameOf(home)} wins
                    </button>
                    <button onClick={() => walkover('away')} disabled={busy} className="py-2 rounded-lg bg-elevated hover:bg-surface border border-line text-sm transition-colors disabled:opacity-50">
                      {nameOf(away)} wins
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-custom">Assign both teams above to record a walkover.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamSelect({
  label, value, teams, exclude, onChange,
}: { label: string; value: string; teams: { id: string; name: string }[]; exclude: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-gray-custom mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
      >
        <option value="">— TBD —</option>
        {teams.filter((t) => t.id !== exclude).map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </label>
  );
}

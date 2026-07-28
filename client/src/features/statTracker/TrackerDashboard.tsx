import BallLoader from '../../components/BallLoader';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';
import { createSession } from './api';
import { describeDraw } from './drawPreview';
import DrawPreviewPanel from './DrawPreviewPanel';
import { exportTournamentExcel } from './excel';
import TournamentView from './TournamentView';
import type { TrackerFormat, TrackerSession } from './types';
import { Download, Trophy, RotateCcw, AlertTriangle } from 'lucide-react';

export default function TrackerDashboard() {
  const { tournamentId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  // Platform admins and organisers reach the tracker; per-tournament access is
  // enforced server-side (and re-checked below via viewerCanManage).
  if (user?.role !== 'ADMIN' && user?.role !== 'ORGANIZER') return <Navigate to="/home" replace />;

  const { data: tournament } = useQuery({
    queryKey: ['tracker-tournament', tournamentId],
    queryFn: async () => (await api.get(`/tournaments/${tournamentId}`)).data.tournament,
  });

  const { data: session, isLoading } = useQuery<TrackerSession | null>({
    queryKey: ['tracker-session', tournamentId],
    queryFn: async () => (await api.get(`/tracker/sessions/${tournamentId}`)).data.session,
  });

  const [showReset, setShowReset] = useState(false);
  const resetMutation = useMutation({
    mutationFn: () => api.delete(`/tracker/sessions/${tournamentId}`),
    onSuccess: () => {
      toast.success('Draw reset — set it up again');
      setShowReset(false);
      qc.invalidateQueries({ queryKey: ['tracker-session', tournamentId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to reset draw'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <BallLoader />
      </div>
    );
  }

  // Organiser assigned elsewhere (or a non-organiser): the server withholds the
  // data; bounce them out rather than render an empty shell.
  if (tournament && tournament.viewerCanManage === false) return <Navigate to="/home" replace />;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold truncate">{tournament?.name ?? 'Tournament'}</h1>
        {session && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => exportTournamentExcel(session, tournament?.name ?? 'tournament')}
              className="flex items-center gap-2 px-3 py-2 bg-card border border-line hover:border-primary rounded-lg text-xs transition-colors"
            >
              <Download size={14} /> Tournament totals
            </button>
            <button
              onClick={() => setShowReset(true)}
              className="flex items-center gap-2 px-3 py-2 bg-card border border-line hover:border-red-400 text-gray-custom hover:text-red-400 rounded-lg text-xs transition-colors"
              title="Regenerate the draw"
            >
              <RotateCcw size={14} /> Reset draw
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-custom mb-6">
        {tournament?.sport} · {session ? `${session.format} format` : 'Not yet set up'}
      </p>

      {!session ? (
        <CreateSessionForm
          tournamentId={tournamentId!}
          sport={tournament?.sport}
          teamCount={tournament?.teams?.length ?? 0}
          onCreated={() => qc.invalidateQueries({ queryKey: ['tracker-session', tournamentId] })}
        />
      ) : (
        <TournamentView
          session={session}
          onOpenMatch={(m) => nav(`/admin/stat-tracker/${tournamentId}/match/${m.id}`)}
        />
      )}

      <div className="mt-6">
        <Link to="/admin/stat-tracker" className="text-xs text-gray-custom hover:text-foreground">← All tournaments</Link>
      </div>

      {showReset && session && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !resetMutation.isPending && setShowReset(false)}
        >
          <div className="bg-card border border-line rounded-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <h3 className="font-semibold text-lg">Reset the draw?</h3>
            </div>
            <div className="text-sm text-gray-custom space-y-2">
              <p>This permanently deletes the current draw for <span className="text-foreground font-medium">{tournament?.name}</span>:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>all groups, fixtures and the bracket</li>
                <li>any in-progress match tracking</li>
                {(() => {
                  const published = session.matches.filter((m) => m.status === 'PUBLISHED').length;
                  return published > 0
                    ? <li className="text-red-400">{published} published result{published > 1 ? 's' : ''} — including the player stats they wrote to profiles</li>
                    : null;
                })()}
              </ul>
              <p>You'll pick the format and generate a fresh draw. This can't be undone.</p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowReset(false)}
                disabled={resetMutation.isPending}
                className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-elevated transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Resetting…' : 'Reset draw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateSessionForm({
  tournamentId,
  sport,
  teamCount,
  onCreated,
}: {
  tournamentId: string;
  sport?: string;
  teamCount: number;
  onCreated: () => void;
}) {
  const [format, setFormat] = useState<TrackerFormat>('MIXED');
  const [groupsCount, setGroupsCount] = useState(2);
  const [advancePerGroup, setAdvancePerGroup] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(true);
  const [periodMinutes, setPeriodMinutes] = useState(sport === 'BASKETBALL' ? 12 : 45);
  const preview = describeDraw(format, teamCount, { groupsCount, advancePerGroup });

  const mutation = useMutation({
    mutationFn: () =>
      createSession({
        tournamentId,
        format,
        config: {
          groupsCount,
          advancePerGroup,
          thirdPlace,
          ...(sport === 'BASKETBALL'
            ? { quarterSeconds: periodMinutes * 60 }
            : { halfLengthSeconds: periodMinutes * 60 }),
        },
      }),
    onSuccess: () => { toast.success('Fixtures generated'); onCreated(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create session'),
  });

  const showGroups = format === 'MIXED';
  const showKnockout = format === 'KNOCKOUT' || format === 'MIXED';

  return (
    <div className="bg-card rounded-xl border border-line p-6 space-y-5 max-w-2xl">
      <div className="flex items-center gap-2">
        <Trophy size={18} className="text-primary" />
        <h2 className="font-semibold text-lg">Generate fixtures</h2>
      </div>

      <div>
        <label className="block text-sm text-gray-custom mb-2">Format</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['LEAGUE', 'League', 'Round-robin'],
            ['KNOCKOUT', 'Knockout', 'Single elimination'],
            ['MIXED', 'Mixed', 'Groups → knockout'],
          ] as const).map(([value, label, desc]) => (
            <button
              key={value}
              onClick={() => setFormat(value)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                format === value ? 'border-primary bg-primary/10' : 'border-line bg-surface hover:border-gray-600'
              }`}
            >
              <div className="text-sm font-medium">{label}</div>
              <div className="text-[11px] text-gray-custom">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {showGroups && (
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Number of groups" value={groupsCount} min={1} max={8} onChange={setGroupsCount} />
          <NumberField label="Advance per group" value={advancePerGroup} min={1} max={4} onChange={setAdvancePerGroup} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 items-end">
        <NumberField
          label={sport === 'BASKETBALL' ? 'Quarter length (min)' : 'Half length (min)'}
          value={periodMinutes} min={1} max={60} onChange={setPeriodMinutes}
        />
        {showKnockout && (
          <label className="flex items-center gap-2 text-sm pb-2.5">
            <input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} />
            Third-place playoff
          </label>
        )}
      </div>

      <DrawPreviewPanel preview={preview} />

      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || preview.blocked}
        className="w-full py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {mutation.isPending ? 'Generating…' : 'Import teams & generate fixtures'}
      </button>
    </div>
  );
}

function NumberField({
  label, value, min, max, onChange,
}: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="block text-sm text-gray-custom mb-2">{label}</label>
      <input
        type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
      />
    </div>
  );
}

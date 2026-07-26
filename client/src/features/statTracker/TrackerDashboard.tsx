import BallLoader from '../../components/BallLoader';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';
import { createSession } from './api';
import { exportTournamentExcel } from './excel';
import TournamentView from './TournamentView';
import type { TrackerFormat, TrackerSession } from './types';
import { Download, Trophy } from 'lucide-react';

export default function TrackerDashboard() {
  const { tournamentId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  if (user?.role !== 'ADMIN') return <Navigate to="/home" replace />;

  const { data: tournament } = useQuery({
    queryKey: ['tracker-tournament', tournamentId],
    queryFn: async () => (await api.get(`/tournaments/${tournamentId}`)).data.tournament,
  });

  const { data: session, isLoading } = useQuery<TrackerSession | null>({
    queryKey: ['tracker-session', tournamentId],
    queryFn: async () => (await api.get(`/tracker/sessions/${tournamentId}`)).data.session,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <BallLoader />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold truncate">{tournament?.name ?? 'Tournament'}</h1>
        {session && (
          <button
            onClick={() => exportTournamentExcel(session, tournament?.name ?? 'tournament')}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-line hover:border-primary rounded-lg text-xs transition-colors"
          >
            <Download size={14} /> Tournament totals
          </button>
        )}
      </div>
      <p className="text-sm text-gray-custom mb-6">
        {tournament?.sport} · {session ? `${session.format} format` : 'Not yet set up'}
      </p>

      {!session ? (
        <CreateSessionForm
          tournamentId={tournamentId!}
          sport={tournament?.sport}
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
    </div>
  );
}

function CreateSessionForm({
  tournamentId,
  sport,
  onCreated,
}: {
  tournamentId: string;
  sport?: string;
  onCreated: () => void;
}) {
  const [format, setFormat] = useState<TrackerFormat>('MIXED');
  const [groupsCount, setGroupsCount] = useState(2);
  const [advancePerGroup, setAdvancePerGroup] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(true);
  const [periodMinutes, setPeriodMinutes] = useState(sport === 'BASKETBALL' ? 12 : 45);

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

      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="w-full py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm disabled:opacity-50"
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

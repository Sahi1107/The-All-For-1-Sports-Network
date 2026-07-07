import BallLoader from '../../components/BallLoader';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';
import { createSession } from './api';
import { standingsFor } from './stats';
import { exportTournamentExcel } from './excel';
import type { TrackerFormat, TrackerSession, TrackerMatch, GroupDef } from './types';
import { Download, Play, CheckCircle2, Trophy } from 'lucide-react';

const STAGE_ORDER = ['group', 'league', 'r32', 'r16', 'qf', 'sf', 'third_place', 'final'];

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
        <SessionView session={session} onOpenMatch={(m) => nav(`/admin/stat-tracker/${tournamentId}/match/${m.id}`)} />
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

function SessionView({
  session,
  onOpenMatch,
}: { session: TrackerSession; onOpenMatch: (m: TrackerMatch) => void }) {
  const teamNameMap = useMemo(() => {
    const m = new Map<string, string>();
    (session.roster ?? []).forEach((t) => m.set(t.teamId, t.name));
    return m;
  }, [session.roster]);
  const teamName = (id: string | null) => (id ? teamNameMap.get(id) ?? 'TBD' : 'TBD');

  const byStage = useMemo(() => {
    const groups = new Map<string, TrackerMatch[]>();
    [...session.matches]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .forEach((m) => {
        const key = m.stage;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(m);
      });
    return [...groups.entries()].sort(
      (a, b) => STAGE_ORDER.indexOf(a[0]) - STAGE_ORDER.indexOf(b[0]),
    );
  }, [session.matches]);

  return (
    <div className="space-y-6">
      {/* Standings */}
      {session.format === 'LEAGUE' && (
        <StandingsTable title="League table" rows={standingsFor(session, (session.roster ?? []).map((t) => t.teamId))} />
      )}
      {session.format === 'MIXED' && (session.groups ?? []).map((g: GroupDef) => (
        <StandingsTable key={g.id} title={g.name} rows={standingsFor(session, g.teamIds)} />
      ))}

      {/* Fixtures by stage */}
      {byStage.map(([stage, matches]) => (
        <div key={stage}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-custom mb-2">
            {matches[0].round || stage}
          </h3>
          <div className="bg-card rounded-xl border border-line overflow-hidden divide-y divide-line">
            {matches.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                  <span className="text-right truncate">{teamName(m.homeTeamId)}</span>
                  <span className="font-mono font-semibold px-2">
                    {m.status === 'SCHEDULED' ? 'vs' : `${m.homeScore}–${m.awayScore}`}
                  </span>
                  <span className="truncate">{teamName(m.awayTeamId)}</span>
                </div>
                <StatusBadge status={m.status} />
                <button
                  onClick={() => onOpenMatch(m)}
                  disabled={!m.homeTeamId || !m.awayTeamId}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary-dark text-on-primary text-xs font-semibold rounded-lg disabled:opacity-40"
                >
                  {m.status === 'PUBLISHED' ? <CheckCircle2 size={13} /> : <Play size={13} />}
                  {m.status === 'SCHEDULED' ? 'Track' : m.status === 'PUBLISHED' ? 'View' : 'Resume'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SCHEDULED: 'bg-elevated text-gray-custom border-line',
    IN_PROGRESS: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    COMPLETED: 'bg-primary/20 text-primary-light border-primary/30',
    PUBLISHED: 'bg-accent/20 text-accent border-accent/30',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${map[status] ?? map.SCHEDULED}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function StandingsTable({ title, rows }: { title: string; rows: ReturnType<typeof standingsFor> }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-custom mb-2">{title}</h3>
      <div className="bg-card rounded-xl border border-line overflow-hidden">
        <div className="grid grid-cols-[2fr_repeat(6,1fr)] gap-1 px-4 py-2 text-[11px] text-gray-custom border-b border-line">
          <span>Team</span><span className="text-center">P</span><span className="text-center">W</span>
          <span className="text-center">D</span><span className="text-center">L</span>
          <span className="text-center">GD</span><span className="text-center">Pts</span>
        </div>
        {rows.map((r) => (
          <div key={r.teamId} className="grid grid-cols-[2fr_repeat(6,1fr)] gap-1 px-4 py-2 text-sm border-b border-line last:border-0">
            <span className="truncate">{r.teamName}</span>
            <span className="text-center">{r.played}</span><span className="text-center">{r.wins}</span>
            <span className="text-center">{r.draws}</span><span className="text-center">{r.losses}</span>
            <span className="text-center">{r.goalDifference}</span>
            <span className="text-center font-semibold text-primary-light">{r.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

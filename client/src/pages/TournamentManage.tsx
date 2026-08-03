import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import BallLoader from '../components/BallLoader';
import RosterEditorModal from '../features/tournaments/RosterEditorModal';
import AddTeamModal from '../features/tournaments/AddTeamModal';
import TournamentDetailsModal from '../features/tournaments/TournamentDetailsModal';
import OrganizersModal from '../features/tournaments/OrganizersModal';
import { canManageDraw, isRegistrationOpen, TRACKER_SPORTS, LATE_ENTRY_WARNING } from '../features/tournaments/manageGate';
import {
  ArrowLeft, Check, Info, Users, Flag, GitFork, CalendarClock, Radio,
  UserPlus, Upload, AlertTriangle, ChevronRight, MapPin, Calendar, Crown,
  ShieldCheck, Pencil,
} from 'lucide-react';

const SPORT = (s?: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ') : '');
const LIFECYCLE_ACTIONS: Record<string, { to: string; label: string; primary?: boolean }[]> = {
  UPCOMING:            [{ to: 'REGISTRATION_OPEN', label: 'Open registration', primary: true }],
  REGISTRATION_OPEN:   [{ to: 'REGISTRATION_CLOSED', label: 'Close registration', primary: true }],
  REGISTRATION_CLOSED: [{ to: 'IN_PROGRESS', label: 'Start tournament', primary: true }, { to: 'REGISTRATION_OPEN', label: 'Reopen registration' }],
  IN_PROGRESS:         [{ to: 'COMPLETED', label: 'Mark complete', primary: true }],
  COMPLETED:           [{ to: 'IN_PROGRESS', label: 'Reopen' }],
  CANCELLED:           [{ to: 'UPCOMING', label: 'Reactivate', primary: true }],
};
const STATUS_STYLE: Record<string, string> = {
  UPCOMING: 'bg-blue-500/20 text-blue-400', REGISTRATION_OPEN: 'bg-accent/20 text-accent',
  REGISTRATION_CLOSED: 'bg-amber-500/20 text-amber-300', IN_PROGRESS: 'bg-accent/20 text-accent',
  COMPLETED: 'bg-gray-500/20 text-gray-custom', CANCELLED: 'bg-red-500/20 text-red-400',
};

export default function TournamentManage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [editTeam, setEditTeam] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showOrganizers, setShowOrganizers] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);

  if (!user) return <Navigate to="/home" replace />;
  const isSuperAdmin = user.role === 'ADMIN';

  const { data: t, isLoading } = useQuery({
    queryKey: ['manage-tournament', id],
    queryFn: async () => (await api.get(`/tournaments/${id}`)).data.tournament,
  });
  // Advisory only — the server enforces access. Undefined during load ⇒ optimistic.
  const canManage = t?.viewerCanManage !== false;
  const { data: regData } = useQuery({
    queryKey: ['admin-tournament-registrations', id],
    queryFn: async () => (await api.get(`/tournaments/${id}/registrations`)).data,
    enabled: !!t && canManage,
  });
  const { data: session } = useQuery({
    queryKey: ['tracker-session', id],
    queryFn: async () => (await api.get(`/tracker/sessions/${id}`)).data.session,
    enabled: !!t && canManage && canManageDraw(t?.status),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.put(`/tournaments/${id}`, { status }),
    onSuccess: (_d, status) => { toast.success(`Status → ${status.replace(/_/g, ' ').toLowerCase()}`); qc.invalidateQueries({ queryKey: ['manage-tournament', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update status'),
  });

  if (isLoading || !t) return <div className="flex justify-center py-20"><BallLoader /></div>;
  // Organiser assigned elsewhere, or an ordinary user who guessed the URL.
  if (!t.viewerCanManage) return <Navigate to="/home" replace />;

  const registrations: any[] = regData?.registrations ?? [];
  const pendingTeams = registrations.filter((r) => r.summary.pending > 0).length;
  // Draw & tracking are MANAGEMENT actions — available in every non-cancelled
  // state, including while registration is open (see manageGate). Registration
  // closing only stops the public from self-registering.
  const trackable = canManageDraw(t.status);
  const regOpen = isRegistrationOpen(t.status);
  const sportTrackable = TRACKER_SPORTS.has(t.sport);
  const hasDraw = !!session;
  const scheduledCount = (session?.matches ?? []).filter((m: any) => m.scheduledAt).length;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => nav(isSuperAdmin ? '/admin' : '/home')} className="flex items-center gap-2 text-sm text-gray-custom hover:text-foreground mb-5">
        <ArrowLeft size={16} /> {isSuperAdmin ? 'Admin' : 'Home'}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{t.name}</h1>
          <p className="text-sm text-gray-custom mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{SPORT(t.sport)}</span>
            {(t.city || t.venue) && <span className="flex items-center gap-1"><MapPin size={12} />{[t.venue, t.city].filter(Boolean).join(', ')}</span>}
            {t.startDate && <span className="flex items-center gap-1"><Calendar size={12} />{new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLE[t.status] ?? 'bg-elevated text-gray-custom'}`}>{t.status.replace(/_/g, ' ')}</span>
      </div>
      <Link to={`/tournaments/${id}`} className="text-xs text-primary-light hover:underline">View public page →</Link>

      <div className="space-y-4 mt-6">
        {/* 1 · Details */}
        <Stage n={1} icon={Info} title="Details" done state="Created">
          <p className="text-sm text-gray-custom">
            {SPORT(t.sport)} · {t.format.toLowerCase()} entry
            {t.startDate && <> · {new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{t.endDate ? `–${new Date(t.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</>}
          </p>
          {t.description && <p className="text-sm text-gray-custom mt-1 line-clamp-2">{t.description}</p>}
          {canManage && (
            <button onClick={() => setShowEditDetails(true)}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-card border border-line hover:border-primary text-xs font-medium rounded-lg transition-colors">
              <Pencil size={13} /> Edit details
            </button>
          )}
        </Stage>

        {/* 2 · Teams */}
        <Stage n={2} icon={Users} title="Teams & players" done={registrations.length > 0} state={`${registrations.length} team${registrations.length === 1 ? '' : 's'}`}>
          {pendingTeams > 0 && (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-300 mb-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{pendingTeams} team{pendingTeams > 1 ? 's have' : ' has'} players who haven't accepted — they're excluded from the draw.</span>
            </div>
          )}
          {registrations.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {registrations.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate flex items-center gap-1.5">
                    {r.team.captain && <Crown size={11} className="text-primary shrink-0" />}{r.team.name}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${r.summary.isComplete ? 'bg-accent/20 text-accent' : 'bg-amber-500/20 text-amber-300'}`}>
                    {r.summary.accepted}/{r.summary.total}
                  </span>
                  <button onClick={() => setEditTeam(r.team)} className="text-xs text-primary-light hover:underline shrink-0">Edit</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-line hover:border-primary text-xs font-medium rounded-lg transition-colors"><UserPlus size={13} /> Add team</button>
            {canManage && (
              <Link to={`/admin/tournaments/${id}/provision`} className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-line hover:border-primary text-xs font-medium rounded-lg transition-colors"><Upload size={13} /> Import CSV</Link>
            )}
          </div>
        </Stage>

        {/* 3 · Status */}
        <Stage n={3} icon={Flag} title="Registration & status" done={trackable} state={t.status.replace(/_/g, ' ')}>
          <div className="flex flex-wrap items-center gap-2">
            {(LIFECYCLE_ACTIONS[t.status] ?? []).map((a) => (
              <button key={a.to} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(a.to)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${a.primary ? 'bg-primary hover:bg-primary-dark text-on-primary' : 'bg-elevated hover:bg-card border border-line'}`}>
                {a.label}
              </button>
            ))}
            {!['CANCELLED', 'COMPLETED'].includes(t.status) && (
              <button disabled={statusMutation.isPending} onClick={() => { if (confirm(`Cancel "${t.name}"?`)) statusMutation.mutate('CANCELLED'); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-elevated border border-line text-red-400 disabled:opacity-50">Cancel</button>
            )}
          </div>
          {regOpen && <p className="text-[11px] text-gray-custom mt-2">Registration is open — the public can still self-register. You can set up the draw now regardless; closing registration only stops new public entries.</p>}
        </Stage>

        {/* 4 · Draw */}
        <Stage n={4} icon={GitFork} title="Draw & fixtures" done={hasDraw} state={hasDraw ? `${session.format} draw generated` : 'Not set up'} muted={!trackable}>
          {!sportTrackable ? (
            <p className="text-sm text-gray-custom">Automatic draws &amp; live tracking support Football and Basketball. For {SPORT(t.sport)}, add fixtures/results manually.</p>
          ) : !trackable ? (
            <p className="text-sm text-gray-custom">This tournament is cancelled.</p>
          ) : (
            <div className="space-y-2">
              {regOpen && !hasDraw && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-200">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>{LATE_ENTRY_WARNING}</span>
                </div>
              )}
              <Link to={`/admin/stat-tracker/${id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-on-primary text-xs font-semibold rounded-lg transition-colors">
                {hasDraw ? 'Open draw' : 'Generate draw'} <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </Stage>

        {/* 5 · Schedule */}
        <Stage n={5} icon={CalendarClock} title="Schedule" done={hasDraw && scheduledCount > 0}
          state={hasDraw ? (scheduledCount > 0 ? `${scheduledCount} match${scheduledCount === 1 ? '' : 'es'} scheduled` : 'Not scheduled') : '—'} muted={!hasDraw}>
          {hasDraw ? (
            <Link to={`/admin/stat-tracker/${id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-line hover:border-primary text-xs font-medium rounded-lg transition-colors">
              <CalendarClock size={13} /> Set times &amp; courts
            </Link>
          ) : (
            <p className="text-sm text-gray-custom">Generate the draw first, then set match times and courts.</p>
          )}
        </Stage>

        {/* 6 · Track */}
        <Stage n={6} icon={Radio} title="Track & publish" done={false} state="Live scoring" muted={!hasDraw} last>
          {hasDraw ? (
            <Link to={`/admin/stat-tracker/${id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-on-primary text-xs font-semibold rounded-lg transition-colors">
              Open Stat Tracker <ChevronRight size={14} />
            </Link>
          ) : (
            <p className="text-sm text-gray-custom">Track matches live and publish results once the draw is set up.</p>
          )}
        </Stage>
      </div>

      {/* Organisers — super-admin governance, outside the delivery pipeline */}
      {isSuperAdmin && (
        <div className="mt-6 bg-card rounded-xl border border-line p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/40 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">Organisers</h2>
            <p className="text-[12px] text-gray-custom mt-0.5">
              Give someone scoped control of this tournament — everything on this page — without any platform-wide admin access.
            </p>
            <button onClick={() => setShowOrganizers(true)} className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 bg-elevated hover:bg-surface border border-line text-xs font-medium rounded-lg transition-colors">
              <ShieldCheck size={13} /> Manage organisers
            </button>
          </div>
        </div>
      )}

      {editTeam && <RosterEditorModal tournamentId={id!} team={editTeam} sport={t.sport} onClose={() => setEditTeam(null)} />}
      {showAdd && <AddTeamModal tournamentId={id!} sport={t.sport} onClose={() => setShowAdd(false)} />}
      {showEditDetails && <TournamentDetailsModal tournament={t} onClose={() => setShowEditDetails(false)} />}
      {showOrganizers && <OrganizersModal tournamentId={id!} tournamentName={t.name} onClose={() => setShowOrganizers(false)} />}
    </div>
  );
}

function Stage({
  n, icon: Icon, title, state, done, muted, last, children,
}: {
  n: number; icon: any; title: string; state?: string;
  done?: boolean; muted?: boolean; last?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      {/* rail */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${done ? 'bg-primary/15 border-primary/40 text-primary' : muted ? 'bg-elevated border-line text-gray-custom' : 'bg-card border-line text-foreground'}`}>
          {done ? <Check size={15} /> : <Icon size={15} />}
        </div>
        {!last && <div className="w-px flex-1 bg-line my-1" />}
      </div>
      {/* card */}
      <div className={`flex-1 bg-card rounded-xl border border-line p-4 mb-1 ${muted ? 'opacity-70' : ''}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold">{n}. {title}</h2>
          {state && <span className="text-[11px] text-gray-custom shrink-0">{state}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

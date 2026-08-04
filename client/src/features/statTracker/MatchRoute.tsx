import BallLoader from '../../components/BallLoader';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useTrackerMatch } from './useTrackerMatch';
import { publishMatch } from './api';
import { exportMatchExcel } from './excel';
import FullscreenShell from './FullscreenShell';
import FootballMatch from './football/FootballMatch';
import BasketballMatch from './basketball/BasketballMatch';
import { saveDisplay } from './saveState';
import { Download, Loader2, UploadCloud, CheckCircle2, CloudOff, AlertTriangle, ListOrdered } from 'lucide-react';

export default function MatchRoute() {
  const { tournamentId, matchId } = useParams();
  const { user } = useAuth();
  const ctrl = useTrackerMatch(matchId!);
  const [publishing, setPublishing] = useState(false);

  // Admins and organisers reach the live tracker; the match fetch itself is
  // server-gated per tournament, so a denied organiser simply gets no data below.
  if (user?.role !== 'ADMIN' && user?.role !== 'ORGANIZER') return <Navigate to="/home" replace />;

  const { match, session, loading, loadError, saveState } = ctrl;

  if (loading) {
    return (
      <FullscreenShell backTo={`/admin/stat-tracker/${tournamentId}`}>
        <div className="flex justify-center py-16">
          <BallLoader />
        </div>
      </FullscreenShell>
    );
  }

  // Load failed (server withheld it, it's gone, or an error) — during live scoring
  // a silent bounce to /home is the worst failure, so show a clear message with a
  // way back to fixtures. The underlying error is logged in useTrackerMatch.
  // NOTE (Sahil): this is in the live-scoring path — the root cause was the initial
  // load having no .catch, so any getMatch() failure vanished into a redirect.
  if (!match || !session) {
    return (
      <FullscreenShell backTo={`/admin/stat-tracker/${tournamentId}`}>
        <div className="flex flex-col items-center justify-center text-center px-6 py-24">
          <span className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
            <AlertTriangle size={24} className="text-red-400" />
          </span>
          <h2 className="text-lg font-semibold text-foreground">This match couldn&apos;t be loaded</h2>
          <p className="text-sm text-gray-custom mt-1.5 max-w-sm">
            {(loadError as any)?.response?.status === 403
              ? "You don't have access to this match."
              : "It may have been removed, or the tracker couldn't reach it. The error has been logged."}
          </p>
          <Link
            to={`/admin/stat-tracker/${tournamentId}`}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
          >
            <ListOrdered size={15} /> Back to fixtures
          </Link>
        </div>
      </FullscreenShell>
    );
  }

  const isPublished = match.status === 'PUBLISHED';
  const canPublish = match.status === 'COMPLETED' || isPublished;

  const save = saveDisplay(saveState);
  // Sahil's pill styling for the normal states; red only for the honest new ones.
  const SAVE_TONE: Record<string, string> = {
    ok:   'text-gray-custom bg-dark-light/80 border-dark-lighter',
    busy: 'text-gray-custom bg-dark-light/80 border-dark-lighter',
    bad:  'text-red-300 bg-red-500/15 border-red-500/40',
  };
  // Icon only where his original had one (the Saving spinner) or where a red state
  // needs to read at a glance. 'Saved' stays plain text, exactly as he had it.
  const SaveIcon = saveState === 'saving' ? Loader2
    : saveState === 'offline' ? CloudOff
    : saveState === 'error' ? AlertTriangle
    : null;

  async function handlePublish() {
    if (!confirm('Publish this match? Player stats will be written to their profiles and the match added to the tournament log.')) return;
    setPublishing(true);
    try {
      const res = await publishMatch(matchId!);
      toast.success(`Published — stats saved for ${res.playerCount} players`);
      await ctrl.flush();
      // reflect new status locally
      ctrl.setMatch((prev) => (prev ? { ...prev, status: 'PUBLISHED', publishedMatchId: res.matchId } : prev));
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <FullscreenShell
      backTo={`/admin/stat-tracker/${tournamentId}`}
      topRight={
        <span
          role="status" aria-live="polite"
          className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 border ${SAVE_TONE[save.tone]}`}
        >
          {SaveIcon && <SaveIcon size={12} className={saveState === 'saving' ? 'animate-spin' : ''} />} {save.label}
        </span>
      }
    >
      {session.sport === 'FOOTBALL'
        ? <FootballMatch ctrl={ctrl} />
        : <BasketballMatch ctrl={ctrl} />}

      {/* Publish / export bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-dark-light border-t border-dark-lighter px-4 py-3 flex items-center justify-end gap-2 z-30">
        <button
          onClick={() => exportMatchExcel(match, session)}
          className="flex items-center gap-2 px-4 py-2 bg-dark border border-dark-lighter hover:border-primary rounded-lg text-sm"
        >
          <Download size={15} /> Download Excel
        </button>
        <button
          onClick={handlePublish}
          disabled={!canPublish || publishing}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 ${
            isPublished ? 'bg-accent/20 text-accent border border-accent/30' : 'bg-primary text-dark hover:bg-primary-dark'
          }`}
          title={!canPublish ? 'End the match before publishing' : ''}
        >
          {publishing ? <Loader2 size={15} className="animate-spin" />
            : isPublished ? <CheckCircle2 size={15} /> : <UploadCloud size={15} />}
          {isPublished ? 'Re-publish' : 'Publish to platform'}
        </button>
      </div>
    </FullscreenShell>
  );
}

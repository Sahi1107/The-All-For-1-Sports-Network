import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useTrackerMatch } from './useTrackerMatch';
import { publishMatch } from './api';
import { exportMatchExcel } from './excel';
import FootballMatch from './football/FootballMatch';
import BasketballMatch from './basketball/BasketballMatch';
import { Download, Loader2, UploadCloud, CheckCircle2 } from 'lucide-react';

export default function MatchRoute() {
  const { tournamentId, matchId } = useParams();
  const { user } = useAuth();
  const ctrl = useTrackerMatch(matchId!);
  const [publishing, setPublishing] = useState(false);

  if (user?.role !== 'ADMIN') return <Navigate to="/home" replace />;

  const { match, session, loading, saving } = ctrl;

  if (loading || !match || !session) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isPublished = match.status === 'PUBLISHED';
  const canPublish = match.status === 'COMPLETED' || isPublished;

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
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <Link to={`/admin/stat-tracker/${tournamentId}`} className="text-sm text-gray-custom hover:text-white">
          ← Tournament
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-gray-custom">
          {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : 'Saved'}
        </span>
      </div>

      {session.sport === 'FOOTBALL'
        ? <FootballMatch ctrl={ctrl} />
        : <BasketballMatch ctrl={ctrl} />}

      {/* Publish / export bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-dark-light border-t border-dark-lighter px-4 py-3 flex items-center justify-end gap-2 z-20">
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
    </div>
  );
}

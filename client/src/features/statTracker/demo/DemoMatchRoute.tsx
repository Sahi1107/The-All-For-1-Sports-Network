import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useDemoMatch } from './useDemoMatch';
import { exportMatchExcel } from '../excel';
import FullscreenShell from '../FullscreenShell';
import FootballMatch from '../football/FootballMatch';
import BasketballMatch from '../basketball/BasketballMatch';
import { Download, FlaskConical } from 'lucide-react';
import type { TrackerSport } from '../types';

export default function DemoMatchRoute() {
  const { user } = useAuth();
  const { sport } = useParams();
  const normalized: TrackerSport = sport === 'football' ? 'FOOTBALL' : 'BASKETBALL';
  const ctrl = useDemoMatch(normalized);

  if (user?.role !== 'ADMIN') return <Navigate to="/home" replace />;

  const { match, session } = ctrl;
  if (!match || !session) return null;

  return (
    <FullscreenShell
      backTo="/admin/stat-tracker"
      topRight={
        <span className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <FlaskConical size={12} /> Demo — nothing is saved
        </span>
      }
    >
      {normalized === 'FOOTBALL' ? <FootballMatch ctrl={ctrl} /> : <BasketballMatch ctrl={ctrl} />}

      {/* Export only — publishing is disabled in demo mode */}
      <div className="fixed bottom-0 left-0 right-0 bg-dark-light border-t border-dark-lighter px-4 py-3 flex items-center justify-between gap-2 z-30">
        <span className="text-xs text-gray-custom">Demo data · results are not published to profiles or tournaments.</span>
        <button
          onClick={() => exportMatchExcel(match, session)}
          className="flex items-center gap-2 px-4 py-2 bg-dark border border-dark-lighter hover:border-primary rounded-lg text-sm"
        >
          <Download size={15} /> Download Excel
        </button>
      </div>
    </FullscreenShell>
  );
}

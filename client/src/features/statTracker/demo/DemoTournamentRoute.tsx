import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { FlaskConical, Trophy } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useDemoTournament } from './useDemoTournament';
import { describeDraw } from '../drawPreview';
import DrawPreviewPanel from '../DrawPreviewPanel';
import FullscreenShell from '../FullscreenShell';
import TournamentView from '../TournamentView';
import FootballMatch from '../football/FootballMatch';
import BasketballMatch from '../basketball/BasketballMatch';
import type { TrackerSport, TrackerFormat } from '../types';

const DemoBadge = () => (
  <span className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
    <FlaskConical size={12} /> Demo — nothing is saved
  </span>
);

export default function DemoTournamentRoute() {
  const { user } = useAuth();
  const { sport } = useParams();
  const normalized: TrackerSport = sport === 'football' ? 'FOOTBALL' : 'BASKETBALL';
  const t = useDemoTournament(normalized);

  // Admins and organisers can practise here. The demo is entirely client-side
  // (in-memory sim, no server writes), so practice can't touch real tournament data.
  if (user?.role !== 'ADMIN' && user?.role !== 'ORGANIZER') return <Navigate to="/home" replace />;

  // ── Live-tracking a fixture (inline, so tournament state survives) ──
  if (t.openId && t.matchCtrl) {
    return (
      <FullscreenShell onBack={t.closeMatch} topRight={<DemoBadge />}>
        {normalized === 'FOOTBALL'
          ? <FootballMatch ctrl={t.matchCtrl} />
          : <BasketballMatch ctrl={t.matchCtrl} />}
        <div className="fixed bottom-0 left-0 right-0 bg-dark-light border-t border-dark-lighter px-4 py-3 flex items-center justify-between gap-2 z-30">
          <span className="text-xs text-gray-custom">
            Demo match · end it to record the result and advance the tournament.
          </span>
          <button
            onClick={t.closeMatch}
            className="px-4 py-2 bg-dark border border-dark-lighter hover:border-primary rounded-lg text-sm"
          >
            ← Back to tournament
          </button>
        </div>
      </FullscreenShell>
    );
  }

  // ── Dashboard / setup ──
  return (
    <FullscreenShell backTo="/admin/stat-tracker" topRight={<DemoBadge />}>
      <div className="max-w-4xl mx-auto text-foreground">
        <div className="flex items-center gap-3 mb-1">
          <Trophy size={22} className="text-primary" />
          <h1 className="text-2xl font-bold">{normalized === 'FOOTBALL' ? '⚽' : '🏀'} Demo Tournament</h1>
        </div>
        <p className="text-sm text-gray-custom mb-6">
          A full, self-contained tournament with sample teams. Generate a draw, then quick-sim or
          live-track matches to watch standings, brackets, and stat leaders fill in. Nothing is saved.
        </p>

        {!t.session ? (
          <DemoSetup sport={normalized} onStart={t.createSession} />
        ) : (
          <TournamentView
            session={t.session}
            onOpenMatch={t.openMatch}
            demo={{ onQuickSim: t.quickSim, onSimAll: t.simAll, onReset: t.reset }}
          />
        )}
      </div>
    </FullscreenShell>
  );
}

function DemoSetup({
  sport,
  onStart,
}: {
  sport: TrackerSport;
  onStart: (format: TrackerFormat, config: { groupsCount: number; advancePerGroup: number; thirdPlace: boolean; halfLengthSeconds?: number; quarterSeconds?: number }) => void;
}) {
  const [format, setFormat] = useState<TrackerFormat>('MIXED');
  const [groupsCount, setGroupsCount] = useState(2);
  const [advancePerGroup, setAdvancePerGroup] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(true);
  const [periodMinutes, setPeriodMinutes] = useState(5);
  const preview = describeDraw(format, 8, { groupsCount, advancePerGroup });

  const showGroups = format === 'MIXED';
  const showKnockout = format === 'KNOCKOUT' || format === 'MIXED';

  const start = () =>
    onStart(format, {
      groupsCount,
      advancePerGroup,
      thirdPlace,
      ...(sport === 'BASKETBALL' ? { quarterSeconds: periodMinutes * 60 } : { halfLengthSeconds: periodMinutes * 60 }),
    });

  return (
    <div className="bg-card rounded-xl border border-line p-6 space-y-5 max-w-2xl">
      <div className="flex items-center gap-2">
        <Trophy size={18} className="text-primary" />
        <h2 className="font-semibold text-lg">Generate the draw</h2>
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
          <NumberField label="Number of groups" value={groupsCount} min={1} max={4} onChange={setGroupsCount} />
          <NumberField label="Advance per group" value={advancePerGroup} min={1} max={4} onChange={setAdvancePerGroup} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 items-end">
        <NumberField
          label={sport === 'BASKETBALL' ? 'Quarter length (min)' : 'Half length (min)'}
          value={periodMinutes} min={1} max={20} onChange={setPeriodMinutes}
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
        onClick={start}
        disabled={preview.blocked}
        className="w-full py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm disabled:opacity-50"
      >
        Generate fixtures (8 demo teams)
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

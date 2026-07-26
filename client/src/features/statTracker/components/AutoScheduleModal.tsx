import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, CalendarClock } from 'lucide-react';
import api from '../../../api/client';

/** Bulk / sequential scheduling: lay out every fixture in waves across one or
 *  more courts from a start time, so an admin doesn't set 30 matches by hand.
 *  Individual matches can be fine-tuned afterwards. */
export default function AutoScheduleModal({
  tournamentId, sport, onClose,
}: {
  tournamentId: string;
  sport?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [startAt, setStartAt] = useState('');
  const [matchMinutes, setMatchMinutes] = useState(sport === 'BASKETBALL' ? 40 : 60);
  const [gapMinutes, setGapMinutes] = useState(15);
  const [courtsText, setCourtsText] = useState('Court 1');
  const [onlyUnscheduled, setOnlyUnscheduled] = useState(false);

  const courts = courtsText.split(',').map((c) => c.trim()).filter(Boolean);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/tracker/sessions/${tournamentId}/schedule`, {
        startAt: new Date(startAt).toISOString(),
        matchMinutes, gapMinutes, courts, onlyUnscheduled,
      }),
    onSuccess: (res: any) => {
      toast.success(`Scheduled ${res.data.scheduled} match${res.data.scheduled === 1 ? '' : 'es'}`);
      qc.invalidateQueries({ queryKey: ['tracker-session', tournamentId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to schedule'),
  });

  const valid = !!startAt && courts.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !mutation.isPending && onClose()}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h3 className="font-semibold flex items-center gap-2"><CalendarClock size={16} className="text-primary" /> Auto-schedule fixtures</h3>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="First match starts">
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Num label="Match length (min)" value={matchMinutes} min={1} max={600} onChange={setMatchMinutes} />
            <Num label="Gap between (min)" value={gapMinutes} min={0} max={600} onChange={setGapMinutes} />
          </div>

          <Field label="Courts / pitches (comma-separated)">
            <input
              type="text"
              value={courtsText}
              onChange={(e) => setCourtsText(e.target.value)}
              placeholder="Court 1, Court 2"
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
            />
            <p className="text-[11px] text-gray-custom mt-1">
              {courts.length} court{courts.length === 1 ? '' : 's'} — matches run {courts.length > 1 ? `${courts.length} at a time` : 'one at a time'}.
            </p>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyUnscheduled} onChange={(e) => setOnlyUnscheduled(e.target.checked)} />
            Only schedule matches without a time yet
          </label>

          <p className="text-[11px] text-gray-custom">
            Groups are scheduled first, then knockout rounds in order. Byes are skipped. You can fine-tune any match afterwards.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
          <button onClick={onClose} disabled={mutation.isPending} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-elevated transition-colors disabled:opacity-50">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-on-primary transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? 'Scheduling…' : 'Schedule fixtures'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-custom mb-1.5">{label}</span>
      {children}
    </label>
  );
}
function Num({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <input
        type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
      />
    </Field>
  );
}

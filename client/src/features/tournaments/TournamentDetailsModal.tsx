import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import api from '../../api/client';

interface Tournament {
  id: string; name: string; description?: string | null; venue?: string | null; city?: string | null;
  startDate?: string | null; endDate?: string | null;
  prizePool?: number | null; entryFee?: number | null; maxTeams?: number | null;
  category?: string | null; ageCategory?: string | null; genderCategory?: string | null;
  minRosterSize?: number | null; maxRosterSize?: number | null;
}

const isoToDateInput = (v?: string | null) => (v ? v.slice(0, 10) : '');
const dateInputToIso = (v: string) => (v ? new Date(`${v}T00:00:00.000Z`).toISOString() : undefined);
const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** Edit everything on the tournament record. Scoped server-side to the caller's own
 *  tournament (requireTournamentAccess) — sport/format are fixed at creation. */
export default function TournamentDetailsModal({ tournament, onClose }: { tournament: Tournament; onClose: () => void }) {
  const qc = useQueryClient();
  const t = tournament;
  const [f, setF] = useState({
    name: t.name ?? '',
    description: t.description ?? '',
    venue: t.venue ?? '',
    city: t.city ?? '',
    startDate: isoToDateInput(t.startDate),
    endDate: isoToDateInput(t.endDate),
    prizePool: t.prizePool != null ? String(t.prizePool) : '',
    entryFee: t.entryFee != null ? String(t.entryFee) : '',
    maxTeams: t.maxTeams != null ? String(t.maxTeams) : '',
    category: t.category ?? '',
    ageCategory: t.ageCategory ?? '',
    genderCategory: t.genderCategory ?? '',
    minRosterSize: t.minRosterSize != null ? String(t.minRosterSize) : '',
    maxRosterSize: t.maxRosterSize != null ? String(t.maxRosterSize) : '',
  });
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));

  const datesInvalid = !!(f.startDate && f.endDate && f.endDate < f.startDate);
  const rosterInvalid = !!(f.minRosterSize && f.maxRosterSize && Number(f.minRosterSize) > Number(f.maxRosterSize));
  const valid = f.name.trim().length > 0 && !datesInvalid && !rosterInvalid;

  const save = useMutation({
    mutationFn: () => api.put(`/tournaments/${t.id}`, {
      name: f.name.trim(),
      description: f.description.trim(),
      venue: f.venue.trim(),
      city: f.city.trim(),
      startDate: dateInputToIso(f.startDate),
      endDate: dateInputToIso(f.endDate),
      prizePool: numOrUndef(f.prizePool),
      entryFee: numOrUndef(f.entryFee),
      maxTeams: numOrUndef(f.maxTeams),
      category: f.category.trim(),
      ageCategory: f.ageCategory.trim(),
      genderCategory: f.genderCategory.trim(),
      minRosterSize: numOrUndef(f.minRosterSize),
      maxRosterSize: numOrUndef(f.maxRosterSize),
    }),
    onSuccess: () => {
      toast.success('Tournament updated');
      qc.invalidateQueries({ queryKey: ['manage-tournament', t.id] });
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || e.response?.data?.details?.[0] || 'Could not update tournament'),
  });

  const input = 'w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:border-primary focus:outline-none';
  const label = 'block text-xs font-medium text-gray-custom mb-1';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-custom">Edit</p>
            <h3 className="font-semibold truncate">Tournament details</h3>
          </div>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div>
            <label className={label}>Name</label>
            <input className={input} value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea className={`${input} resize-none`} rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Venue</label>
              <input className={input} value={f.venue} onChange={(e) => set({ venue: e.target.value })} maxLength={100} />
            </div>
            <div>
              <label className={label}>City</label>
              <input className={input} value={f.city} onChange={(e) => set({ city: e.target.value })} maxLength={100} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Start date</label>
              <input type="date" className={input} value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </div>
            <div>
              <label className={label}>End date</label>
              <input type="date" className={input} value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            </div>
          </div>
          {datesInvalid && <p className="text-xs text-red-400 -mt-2">End date must be on or after the start date.</p>}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Entry fee (₹)</label>
              <input type="number" min="0" className={input} value={f.entryFee} onChange={(e) => set({ entryFee: e.target.value })} />
            </div>
            <div>
              <label className={label}>Prize pool (₹)</label>
              <input type="number" min="0" className={input} value={f.prizePool} onChange={(e) => set({ prizePool: e.target.value })} />
            </div>
            <div>
              <label className={label}>Max teams</label>
              <input type="number" min="1" className={input} value={f.maxTeams} onChange={(e) => set({ maxTeams: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Category</label>
              <input className={input} value={f.category} onChange={(e) => set({ category: e.target.value })} maxLength={50} placeholder="Open" />
            </div>
            <div>
              <label className={label}>Age</label>
              <input className={input} value={f.ageCategory} onChange={(e) => set({ ageCategory: e.target.value })} maxLength={30} placeholder="U19" />
            </div>
            <div>
              <label className={label}>Gender</label>
              <input className={input} value={f.genderCategory} onChange={(e) => set({ genderCategory: e.target.value })} maxLength={20} placeholder="Men" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Min roster size</label>
              <input type="number" min="1" className={input} value={f.minRosterSize} onChange={(e) => set({ minRosterSize: e.target.value })} />
            </div>
            <div>
              <label className={label}>Max roster size</label>
              <input type="number" min="1" className={input} value={f.maxRosterSize} onChange={(e) => set({ maxRosterSize: e.target.value })} />
            </div>
          </div>
          {rosterInvalid && <p className="text-xs text-red-400 -mt-2">Minimum roster size must be ≤ maximum.</p>}
          <p className="text-[11px] text-gray-custom">Sport and entry format are fixed once the tournament is created.</p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
          <button onClick={onClose} disabled={save.isPending} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-elevated transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!valid || save.isPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-on-primary transition-colors disabled:opacity-50">
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

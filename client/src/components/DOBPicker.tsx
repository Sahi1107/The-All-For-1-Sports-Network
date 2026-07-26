import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Shared date-of-birth calendar picker used by the email/password Register wizard
// and the Google onboarding wizard. Caps the latest selectable date at 10 years
// ago (the youngest a self-registering account can be) and the earliest at 100
// years ago. Age — and the under-13 guardian gate — is derived from this server-side.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DOBPicker({ value, onChange }: { value: Date | null; onChange: (d: Date) => void }) {
  const today = new Date();
  const maxDate = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());
  const minYear = today.getFullYear() - 100;

  const startYear = value ? value.getFullYear() : maxDate.getFullYear();
  const startMonth = value ? value.getMonth() : maxDate.getMonth();

  const [viewYear, setViewYear]   = useState(startYear);
  const [viewMonth, setViewMonth] = useState(startMonth);

  const years = Array.from({ length: 91 }, (_, i) => maxDate.getFullYear() - i);
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const isDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    return d > maxDate || d.getFullYear() < minYear;
  };

  const isSelected = (day: number) =>
    !!value &&
    value.getFullYear() === viewYear &&
    value.getMonth()    === viewMonth &&
    value.getDate()     === day;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
    const nm = viewMonth === 11 ? 0 : viewMonth + 1;
    if (ny > maxDate.getFullYear() || (ny === maxDate.getFullYear() && nm > maxDate.getMonth())) return;
    setViewYear(ny); setViewMonth(nm);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-surface rounded-xl border border-line p-4 select-none">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button type="button" onClick={prevMonth}
          className="p-1.5 hover:bg-ink/10 rounded-lg text-gray-custom hover:text-foreground transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))}
            className="bg-elevated text-foreground text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary border border-line">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))}
            className="bg-elevated text-foreground text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary border border-line">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button type="button" onClick={nextMonth}
          className="p-1.5 hover:bg-ink/10 rounded-lg text-gray-custom hover:text-foreground transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs text-gray-custom py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) =>
          day === null ? <div key={`e-${i}`} /> : (
            <button key={day} type="button" disabled={isDisabled(day)}
              onClick={() => { if (!isDisabled(day)) onChange(new Date(viewYear, viewMonth, day)); }}
              className={`aspect-square text-xs rounded-full flex items-center justify-center transition-colors mx-auto w-7 h-7
                ${isSelected(day)
                  ? 'bg-primary text-on-primary font-bold'
                  : isDisabled(day)
                  ? 'text-foreground/20 cursor-not-allowed'
                  : 'hover:bg-ink/10 text-foreground'
                }`}
            >
              {day}
            </button>
          )
        )}
      </div>
    </div>
  );
}

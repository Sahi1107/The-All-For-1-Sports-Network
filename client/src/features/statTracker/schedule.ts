// Match-scheduling display + input helpers.

/** "Sat, Aug 1, 2:30 PM · Court 1" — or null when nothing is set (→ caller shows TBC). */
export function fmtSchedule(scheduledAt: string | null | undefined, court: string | null | undefined): string | null {
  const parts: string[] = [];
  if (scheduledAt) {
    parts.push(new Date(scheduledAt).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }));
  }
  if (court) parts.push(court);
  return parts.length ? parts.join(' · ') : null;
}

/** ISO → value for a <input type="datetime-local"> (local time, no seconds/tz). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

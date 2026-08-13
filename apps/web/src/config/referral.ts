// Carries an invite code from the /join landing through registration so signups
// get attributed. Stored in localStorage; cleared once a signup consumes it.
const KEY = 'af1_ref';

export function setRefCode(code: string): void {
  try { localStorage.setItem(KEY, code); } catch { /* private mode */ }
}
export function getRefCode(): string | undefined {
  try { return localStorage.getItem(KEY) || undefined; } catch { return undefined; }
}
export function clearRefCode(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

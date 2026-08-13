import toast from 'react-hot-toast';

// Why this exists: a client fix only reaches an OPEN tab when that tab reloads. This
// is a SPA behind a service worker — the tab keeps running the JS it first loaded,
// and code already in memory (e.g. an open modal's route chunk) never triggers
// vite:preloadError, so main.tsx's reload-on-chunk-error can't catch it. Result: a
// fix ships and the user still sees the old behaviour until they happen to reload.
//
// version.json is written on every deploy with the commit sha. We record it at boot,
// re-check when the tab regains focus (and on a slow interval), and if it changed a
// newer client is live — so we surface a single, dismissible "Reload" prompt. We
// never auto-reload (that would drop whatever the user was typing).

let bootSha: string | null = null;
let notified = false;

async function currentSha(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.sha === 'string' ? body.sha : null;
  } catch {
    return null;
  }
}

async function check(): Promise<void> {
  if (notified) return;
  const sha = await currentSha();
  if (!sha) return;
  if (bootSha === null) { bootSha = sha; return; } // first call records the running version
  if (sha === bootSha) return;
  notified = true;
  toast(
    () => (
      <span className="flex items-center gap-2.5 text-sm">
        <span>A new version is available.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 px-2.5 py-1 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-dark"
        >
          Reload
        </button>
      </span>
    ),
    { id: 'app-update', duration: Infinity },
  );
}

/** Start watching for new deploys. Prod-only (dev has HMR); safe to call once at boot. */
export function startVersionWatch(): void {
  if (!import.meta.env.PROD) return;
  void check(); // record the boot version
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('focus', () => { void check(); });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void check();
  }, 5 * 60 * 1000);
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { initSentry } from './config/sentry.ts'
import { startVersionWatch } from './config/versionWatch.tsx'

// Recover from a failed dynamic import — a stale/missing chunk after a deploy, or
// a transient fetch failure — instead of leaving a blank screen the user has to
// manually refresh out of. Vite fires this when a lazily-imported route/chunk
// can't load; reload once to pull the current bundle. The recent-reload guard
// prevents a loop if the chunk is genuinely gone.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'af1:last-chunk-reload'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 10_000) return // already tried very recently — don't loop
  sessionStorage.setItem(KEY, String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Load error monitoring off the critical path (dynamic import, no-op without a
// DSN). Errors before it loads are buffered by initSentry and flushed on init.
const idle = (cb: () => void) =>
  'requestIdleCallback' in window
    ? (window as unknown as { requestIdleCallback: (c: () => void) => void }).requestIdleCallback(cb)
    : setTimeout(cb, 1);
idle(() => { void initSentry() })

// Detect a new deploy while this tab stays open and offer a reload — so a shipped
// client fix actually reaches users who never closed the app (the recurring
// "shipped but still looks broken" trap of a SPA + service worker).
startVersionWatch()

// Register the service worker (offline shell + web push) in production only,
// so dev never caches stale assets.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* non-fatal */ })
  })
}

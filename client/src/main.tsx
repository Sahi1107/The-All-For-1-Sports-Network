import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { initSentry } from './config/sentry.ts'

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

// Register the service worker (offline shell + web push) in production only,
// so dev never caches stale assets.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* non-fatal */ })
  })
}

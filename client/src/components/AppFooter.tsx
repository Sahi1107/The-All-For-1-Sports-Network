import { Link } from 'react-router-dom';

/**
 * Minimal in-app footer — essential legal/safety links only, small and muted.
 * Rendered by MainLayout on app pages that have a natural end (not the feed or
 * chat). Privacy/Terms are in-app routes (<Link>); Safety is an SSR page served
 * by allfor1-web, so it uses a hard-nav <a href>.
 */
export default function AppFooter() {
  return (
    <footer className="mt-10 pt-5 border-t border-ink/10 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-custom">
      <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
      <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
      <a href="/safety" className="hover:text-foreground transition-colors">Safety</a>
      <span className="ml-auto">© {new Date().getFullYear()} The AllFor1 Network</span>
    </footer>
  );
}

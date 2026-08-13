import { useEffect, useState } from 'react';

// Module-scoped: false on a cold load / refresh (fresh bundle), stays true once
// the first page has shown the wipe. SPA navigations keep the module in memory,
// so they skip straight to the quick fade — the big sweep only plays on a real
// page load, never on every click.
let introShown = false;

/**
 * True for the first page rendered after a page load, false for subsequent
 * in-app navigations. Show the dramatic page-wipe when true, a quick fade when
 * false, so the sweep never gets repetitive.
 */
export function useIntro(): boolean {
  // Pure read keeps React StrictMode's double-invoke deterministic.
  const [firstVisit] = useState(() => !introShown);
  useEffect(() => {
    // Defer marking "shown" past StrictMode's synchronous remount so the first
    // page still gets the wipe in dev; real navigations happen long after this.
    const t = setTimeout(() => {
      introShown = true;
    }, 100);
    return () => clearTimeout(t);
  }, []);
  return firstVisit;
}

/**
 * The signature volt page-wipe intro (dark panel + volt panel skew-sweep),
 * shown once on mount for ~1.2s. Same effect the landing uses; drop it at the
 * top of a page to give it the same entrance.
 */
export default function PageWipe() {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setActive(false), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!active) return null;
  return (
    <>
      <div className="page-wipe page-wipe--back" aria-hidden />
      <div className="page-wipe page-wipe--front" aria-hidden />
    </>
  );
}

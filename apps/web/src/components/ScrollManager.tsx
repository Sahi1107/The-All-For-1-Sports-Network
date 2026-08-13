import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * App-wide scroll restoration. Every forward navigation (PUSH/REPLACE — a link,
 * a redirect) starts at the top; a genuine back/forward (POP) keeps the browser's
 * restored position. Keyed on pathname only, so in-page hash/anchor navigation
 * (e.g. the landing section links) is left untouched.
 *
 * Fixes pages that opened scrolled to the middle because the previous page's
 * scroll offset carried over.
 */
export default function ScrollManager() {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (navType === 'POP') return; // back/forward → let the browser restore position
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, navType]);

  return null;
}

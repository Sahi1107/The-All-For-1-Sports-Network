import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Consent } from '../config/consent';
import { startAnalytics, identifyUser, resetAnalytics, trackPageview } from '../config/analytics';

// Bridges React lifecycle to the analytics module. Renders nothing. Everything
// here is a no-op until analytics is both configured and consent is 'granted'.
export default function AnalyticsManager({ consent }: { consent: Consent | null }) {
  const { user } = useAuth();
  const location = useLocation();

  // Start (or, on a mid-session Accept, re-run once consent flips to granted).
  useEffect(() => {
    if (consent === 'granted') startAnalytics();
  }, [consent]);

  // Identify the signed-in user; clear identity on logout.
  useEffect(() => {
    if (consent !== 'granted') return;
    if (user) identifyUser(user.id, { role: user.role });
    else resetAnalytics();
  }, [user, consent]);

  // Path-only pageviews (never the query string — it can carry tokens).
  useEffect(() => {
    if (consent === 'granted') trackPageview(location.pathname);
  }, [location.pathname, consent]);

  return null;
}

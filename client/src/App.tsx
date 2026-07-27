import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import MainLayout from './layouts/MainLayout';
import NotFound from './pages/NotFound';
import BallLoader from './components/BallLoader';
import AnalyticsManager from './components/AnalyticsManager';
import ConsentBanner from './components/ConsentBanner';
import InstallPrompt from './components/InstallPrompt';
import OfflineIndicator from './components/OfflineIndicator';
import { getConsent, setConsent, type Consent } from './config/consent';
import { stopAnalytics, analyticsAvailable } from './config/analytics';

// Lazy-load every page so the initial bundle is tiny
const Landing        = lazy(() => import('./pages/Landing'));
const Challenges     = lazy(() => import('./pages/Challenges'));
const Terms          = lazy(() => import('./pages/Terms'));
const Privacy        = lazy(() => import('./pages/Privacy'));
const Login          = lazy(() => import('./pages/Login'));
const Register       = lazy(() => import('./pages/Register'));
const Onboarding     = lazy(() => import('./pages/Onboarding'));
const Support        = lazy(() => import('./pages/Support'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const Unsubscribe    = lazy(() => import('./pages/Unsubscribe'));
const Invite         = lazy(() => import('./pages/Invite'));
const JoinInvite     = lazy(() => import('./pages/JoinInvite'));
const Home           = lazy(() => import('./pages/Home'));
const Explore        = lazy(() => import('./pages/Explore'));
const Profile        = lazy(() => import('./pages/Profile'));
const EditProfile    = lazy(() => import('./pages/EditProfile'));
const Tournaments       = lazy(() => import('./pages/Tournaments'));
const TournamentDetail   = lazy(() => import('./pages/TournamentDetail'));
const TournamentRegister = lazy(() => import('./pages/TournamentRegister'));
const TournamentManage   = lazy(() => import('./pages/TournamentManage'));
const TeamManage         = lazy(() => import('./pages/TeamManage'));
const Rankings       = lazy(() => import('./pages/Rankings'));
const Messages       = lazy(() => import('./pages/Messages'));
const Notifications  = lazy(() => import('./pages/Notifications'));
const Announcements  = lazy(() => import('./pages/Announcements'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const BulkProvision  = lazy(() => import('./pages/BulkProvision'));
const ForcePasswordReset = lazy(() => import('./pages/ForcePasswordReset'));
const StatTrackerLauncher = lazy(() => import('./features/statTracker/StatTrackerLauncher'));
const TrackerDashboard     = lazy(() => import('./features/statTracker/TrackerDashboard'));
const TrackerMatchRoute    = lazy(() => import('./features/statTracker/MatchRoute'));
const TrackerDemoRoute     = lazy(() => import('./features/statTracker/demo/DemoTournamentRoute'));
const Radar          = lazy(() => import('./pages/Radar'));
const Grow           = lazy(() => import('./pages/Grow'));
const Settings       = lazy(() => import('./pages/Settings'));
const Suspended      = lazy(() => import('./pages/Suspended'));
const SavedPosts     = lazy(() => import('./pages/SavedPosts'));
const VerifyEmail        = lazy(() => import('./pages/VerifyEmail'));
const VerifyEmailPending = lazy(() => import('./pages/VerifyEmailPending'));
const ForgotPassword     = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword      = lazy(() => import('./pages/ResetPassword'));
const HandoverConsent    = lazy(() => import('./pages/HandoverConsent'));
const GuardianConsent    = lazy(() => import('./pages/GuardianConsent'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

function PageSpinner() {
  return <BallLoader fullScreen />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/" replace />;
  // Bulk-provisioned users must set a real password before reaching the app.
  if (user.mustResetPassword && location.pathname !== '/force-password-reset') {
    return <Navigate to="/force-password-reset" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, needsOnboarding } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/home" replace />;
  // A Google session that hasn't finished onboarding must complete it first.
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** The public landing page. If the user is already authenticated,
 *  bounce them straight into the app. */
function LandingRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, needsOnboarding } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/home" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** First-time Google users land here to supply role/DOB/sport before entering
 *  the app. Reachable only while a Google session needs onboarding. */
function OnboardingRoute() {
  const { user, loading, needsOnboarding } = useAuth();
  if (loading) return <PageSpinner />;
  if (user) return <Navigate to="/home" replace />;
  if (!needsOnboarding) return <Navigate to="/login" replace />;
  return <Onboarding />;
}

function AppRoutes() {
  const { suspension, loading } = useAuth();
  // A suspended account is confined to the appeal screen — it can authenticate
  // but can't use the app until the suspension is lifted.
  if (!loading && suspension) {
    return <Suspense fallback={<PageSpinner />}><Suspended /></Suspense>;
  }
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        {/* Public marketing routes */}
        <Route index                   element={<LandingRoute><Landing /></LandingRoute>} />
        <Route path="/landing"         element={<LandingRoute><Landing /></LandingRoute>} />
        <Route path="/challenges"      element={<Challenges />} />
        <Route path="/terms"           element={<Terms />} />
        <Route path="/privacy"         element={<Privacy />} />

        {/* Public routes */}
        <Route path="/login"           element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register"        element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/onboarding"      element={<OnboardingRoute />} />
        <Route path="/verify-email"   element={<VerifyEmail />} />
        <Route path="/verify-pending" element={<VerifyEmailPending />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/handover/consent" element={<HandoverConsent />} />
        <Route path="/guardian-consent" element={<GuardianConsent />} />
        <Route path="/unsubscribe"     element={<Unsubscribe />} />
        <Route path="/join/:code"      element={<JoinInvite />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="home"                element={<Home />} />
          <Route path="explore"             element={<Explore />} />
          <Route path="tournaments"              element={<Tournaments />} />
          <Route path="tournaments/:id"          element={<TournamentDetail />} />
          <Route path="tournaments/:id/register" element={<TournamentRegister />} />
          <Route path="teams/:id"                element={<TeamManage />} />
          <Route path="rankings"            element={<Rankings />} />
          <Route path="announcements"       element={<Announcements />} />
          <Route path="messages"            element={<Messages />} />
          <Route path="notifications"       element={<Notifications />} />
          <Route path="grow"                element={<Grow />} />
          <Route path="profile/:id"         element={<Profile />} />
          <Route path="profile/edit"        element={<EditProfile />} />
          <Route path="admin"               element={<AdminDashboard />} />
          <Route path="admin/provision"                          element={<BulkProvision />} />
          <Route path="admin/tournaments/:tournamentId/provision" element={<BulkProvision />} />
          <Route path="admin/tournaments/:id/manage"              element={<TournamentManage />} />
          <Route path="admin/stat-tracker"                              element={<StatTrackerLauncher />} />
          <Route path="admin/stat-tracker/:tournamentId"                element={<TrackerDashboard />} />
          <Route path="settings"            element={<Settings />} />
          <Route path="settings/notifications" element={<NotificationSettings />} />
          <Route path="invite"              element={<Invite />} />
          <Route path="support"             element={<Support />} />
          <Route path="saved"               element={<SavedPosts />} />
          <Route path="radar"               element={<Radar />} />
        </Route>

        {/* Forced first-login password change (bulk-provisioned accounts) */}
        <Route path="/force-password-reset" element={<ProtectedRoute><ForcePasswordReset /></ProtectedRoute>} />

        {/* Full-screen live trackers (no app sidebar) */}
        <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
          <Route path="/admin/stat-tracker/demo/:sport"                  element={<TrackerDemoRoute />} />
          <Route path="/admin/stat-tracker/:tournamentId/match/:matchId" element={<TrackerMatchRoute />} />
        </Route>

        {/* Catch-all → real 404 (adapts to auth state) */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

/** Holds analytics-consent state and renders the consent banner + analytics
 *  bridge. Lives inside Router + AuthProvider so it can read location + user. */
function ConsentGate() {
  const [consent, setConsentState] = useState<Consent | null>(() => getConsent());
  const decide = (v: Consent) => {
    setConsent(v);
    setConsentState(v);
    if (v === 'denied') stopAnalytics();
  };
  return (
    <>
      <AnalyticsManager consent={consent} />
      {/* Only ask for consent when analytics is actually configured. */}
      {analyticsAvailable && <ConsentBanner consent={consent} onDecide={decide} />}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
            <ConsentGate />
            <InstallPrompt />
            <OfflineIndicator />
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: 'var(--color-elevated)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-line)',
                },
              }}
            />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

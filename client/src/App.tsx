import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainLayout from './layouts/MainLayout';

// Lazy-load every page so the initial bundle is tiny
const Login          = lazy(() => import('./pages/Login'));
const Register       = lazy(() => import('./pages/Register'));
const Home           = lazy(() => import('./pages/Home'));
const Explore        = lazy(() => import('./pages/Explore'));
const Profile        = lazy(() => import('./pages/Profile'));
const EditProfile    = lazy(() => import('./pages/EditProfile'));
const Teams          = lazy(() => import('./pages/Teams'));
const Tournaments    = lazy(() => import('./pages/Tournaments'));
const Rankings       = lazy(() => import('./pages/Rankings'));
const Messages       = lazy(() => import('./pages/Messages'));
const Notifications  = lazy(() => import('./pages/Notifications'));
const Announcements  = lazy(() => import('./pages/Announcements'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Settings       = lazy(() => import('./pages/Settings'));
const VerifyEmail        = lazy(() => import('./pages/VerifyEmail'));
const VerifyEmailPending = lazy(() => import('./pages/VerifyEmailPending'));
const ForgotPassword     = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword      = lazy(() => import('./pages/ResetPassword'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-dark">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, unverifiedEmail } = useAuth();
  if (loading) return <PageSpinner />;
  if (unverifiedEmail) return <Navigate to="/verify-pending" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, unverifiedEmail } = useAuth();
  if (loading) return null;
  if (unverifiedEmail) return <Navigate to="/verify-pending" replace />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login"           element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register"        element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/verify-email"   element={<VerifyEmail />} />
        <Route path="/verify-pending" element={<VerifyEmailPending />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index                      element={<Home />} />
          <Route path="explore"             element={<Explore />} />
          <Route path="teams"               element={<Teams />} />
          <Route path="tournaments"         element={<Tournaments />} />
          <Route path="rankings"            element={<Rankings />} />
          <Route path="announcements"       element={<Announcements />} />
          <Route path="messages"            element={<Messages />} />
          <Route path="notifications"       element={<Notifications />} />
          <Route path="profile/:id"         element={<Profile />} />
          <Route path="profile/edit"        element={<EditProfile />} />
          <Route path="admin"               element={<AdminDashboard />} />
          <Route path="settings"            element={<Settings />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: '#1f2937', color: '#fff', border: '1px solid #374151' },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

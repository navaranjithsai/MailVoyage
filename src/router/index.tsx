import React, { Suspense } from 'react';
// Remove BrowserRouter import, it's now in App.tsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
// ... other imports ...
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Layout from '@/components/layout/Layout';

// Lazy-loaded page components for route-level code splitting
// Each page becomes its own chunk, loaded on-demand
const LoginPage = React.lazy(() => import('@/pages/LoginPage'));
const RegisterPage = React.lazy(() => import('@/pages/RegisterPage'));
const ForgotPasswordPage = React.lazy(() => import('@/pages/ForgotPasswordPage'));
const DashboardPage = React.lazy(() => import('@/pages/DashboardPage'));
const ComposePage = React.lazy(() => import('@/pages/ComposePage'));
const InboxPage = React.lazy(() => import('@/pages/InboxPage'));
const SentPage = React.lazy(() => import('@/pages/SentPage'));
const DraftsPage = React.lazy(() => import('@/pages/DraftsPage'));
const SettingsPage = React.lazy(() => import('@/pages/SettingsPage'));
const SearchPage = React.lazy(() => import('@/pages/SearchPage'));
const EmailPage = React.lazy(() => import('@/pages/EmailPage'));

// Placeholder for a component that requires authentication
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth(); // Get auth state and loading state
  const location = useLocation();

  if (isLoading) {
    // Optional: Show a loading indicator while checking auth
    return <LoadingSpinner message="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <Layout>
      {children}
    </Layout>
  );
};

// Placeholder for a component that should only be accessed when not logged in
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth(); // Get auth state and loading state

    if (isLoading) {
      // Optional: Show a loading indicator while checking auth
      return <LoadingSpinner message="Loading Authentication..." />;
    }

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};


const AppRouter: React.FC = () => {
  const { isLoading } = useAuth(); // Get loading state

  // Optional: Prevent route rendering until auth check is complete
  // This avoids potential flashes of content or incorrect redirects
  if (isLoading) {
      return <LoadingSpinner message="Initializing Application..." />; // Or a global spinner
  }

  return (
    // Remove BrowserRouter from here
    <Suspense fallback={<LoadingSpinner message="Loading page..." />}>
    <Routes>      {/* Public routes (Login, Register) */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />      {/* Protected routes (Dashboard, Settings, etc.) */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/compose"
        element={
          <ProtectedRoute>
            <ComposePage />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/inbox"
        element={
          <ProtectedRoute>
            <InboxPage />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/sent"
        element={
          <ProtectedRoute>
            <SentPage />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/drafts"
        element={
          <ProtectedRoute>
            <DraftsPage />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <SearchPage />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/email/:id"
        element={
          <ProtectedRoute>
            <EmailPage />
          </ProtectedRoute>
        }
      />       {/* Redirect root path */}
      <Route
          path="/"
          element={
              <NavigateToCorrectRoute />
          }
      />

      {/* Catch-all for 404 Not Found */}
      {/* You might want to create a dedicated NotFoundPage component */}
      <Route path="*" element={<div>404 Not Found</div>} />
    </Routes>
    </Suspense>
  );
};

// Helper component for root path redirection based on auth state
const NavigateToCorrectRoute = () => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingSpinner message="Checking authentication..." />; // Or null, or a spinner
    }

    return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
};

export default AppRouter;

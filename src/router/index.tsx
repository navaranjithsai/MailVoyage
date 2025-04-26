import React from 'react';
// Remove BrowserRouter import, it's now in App.tsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
// ... other imports ...
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import { useAuth } from '@/contexts/AuthContext';

// Placeholder for a component that requires authentication
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth(); // Get auth state and loading state
  const location = useLocation();

  if (isLoading) {
    // Optional: Show a loading indicator while checking auth
    return <div>Loading Auth...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// Placeholder for a component that should only be accessed when not logged in
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth(); // Get auth state and loading state

    if (isLoading) {
      // Optional: Show a loading indicator while checking auth
      return <div>Loading Auth...</div>;
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
      return <div>Initializing Application...</div>; // Or a global spinner
  }

  return (
    // Remove BrowserRouter from here
    <Routes>
      {/* Public routes (Login, Register) */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

      {/* Protected routes (Dashboard, Settings, etc.) */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
       {/* Add other protected routes here */}
       {/* Example:
       <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage /> // Assuming SettingsPage exists
          </ProtectedRoute>
        }
      /> */}

      {/* Redirect root path */}
      {/* Logic moved inside the element prop for clarity */}
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
    // Remove BrowserRouter closing tag
  );
};

// Helper component for root path redirection based on auth state
const NavigateToCorrectRoute = () => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <div>Checking authentication...</div>; // Or null, or a spinner
    }

    return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
};

export default AppRouter;

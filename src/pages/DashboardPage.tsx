import React from 'react';
import { useAuth } from '@/contexts/AuthContext';

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth(); // Get user info and logout function

  const handleLogout = () => {
    logout();
    // toast.info('You have been logged out.'); // Toast is handled in AuthContext logout
  };

  const handleHardReload = () => {
    console.log('Hard reload triggered. Clearing sessionLastValidatedAt...');
    localStorage.removeItem('sessionLastValidatedAt');
    window.location.reload(); // Standard reload, passing true for hard reload is deprecated in modern browsers
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Welcome to MailVoyage Dashboard!</h1>
      {user && (
        <div className="mb-4">
          <p>Logged in as: <strong>{user.username}</strong> ({user.email})</p>
        </div>
      )}
      <p>This is your main application area after login.</p>
      {/* Add dashboard content here */}

      <button
        onClick={handleLogout}
        className="mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
      >
        Logout
      </button>
      <button
        onClick={handleHardReload}
        className="mt-6 ml-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
      >
        Hard Reload Page
      </button>
    </div>
  );
};

export default DashboardPage;

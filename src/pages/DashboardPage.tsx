import React from 'react';
import { useAuth } from '@/contexts/AuthContext'; // Assuming AuthContext exists
import { toast } from 'react-toastify'; // Assuming toast utility is set up

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth(); // Get user info and logout function

  const handleLogout = () => {
    logout();
    toast.info('You have been logged out.');
    // No need to navigate here, AuthProvider/Router should handle redirect
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
    </div>
  );
};

export default DashboardPage;

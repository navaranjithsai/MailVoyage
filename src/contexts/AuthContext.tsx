import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiFetch } from '../lib/apiFetch';
import LoadingSpinner from '../components/common/LoadingSpinner'; // Import LoadingSpinner

interface User {
  id?: number;
  username: string;
  email: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (userData: User) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const RECENT_VALIDATION_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  // Helper functions to safely interact with sessionStorage
  const getSessionItem = (key: string): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      console.error(`Error accessing sessionStorage for key ${key}:`, e);
      return null;
    }
  };

  const setSessionItem = (key: string, value: string): boolean => {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.error(`Error setting sessionStorage for key ${key}:`, e);
      return false;
    }
  };

  const removeSessionItem = (key: string): boolean => {
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error(`Error removing sessionStorage for key ${key}:`, e);
      return false;
    }
  };

  useEffect(() => {
    const verifyAuthOnLoad = async () => {
      console.log('AuthContext: verifyAuthOnLoad triggered.');
      const storedUserString = localStorage.getItem('authUser');
      // Use sessionStorage for sessionLastValidatedAt with our safe helper
      const lastValidatedAtString = getSessionItem('sessionLastValidatedAt');
      const lastValidatedAt = lastValidatedAtString ? parseInt(lastValidatedAtString, 10) : 0;

      console.log('AuthContext: Last validation timestamp:', lastValidatedAt, 'Current time:', Date.now(), 'Difference:', Date.now() - lastValidatedAt);

      if (storedUserString) {
        console.log('AuthContext: Found authUser in localStorage.');
        let parsedUserForValidation: User | null = null;
        try {
          parsedUserForValidation = JSON.parse(storedUserString);
          setUser(parsedUserForValidation); // Optimistically set user
          console.log('AuthContext: Optimistically set user from localStorage:', parsedUserForValidation);
        } catch (e) {
          console.warn('AuthContext: Failed to parse authUser from localStorage. Clearing it.', e);
          localStorage.removeItem('authUser');
          removeSessionItem('sessionLastValidatedAt'); // Clear timestamp from sessionStorage
          setUser(null);
          setIsLoading(false); // Malformed user data, stop here.
          return;
        }

        // At this point, parsedUserForValidation is valid if no error was caught.
        // Check if session was validated recently
        if (Date.now() - lastValidatedAt < RECENT_VALIDATION_THRESHOLD) {
          console.log('AuthContext: Session validated recently. Skipping /api/auth/validate-token call.');
          setIsLoading(false);
          return; // Skip API call
        }
        
        console.log('AuthContext: Session not validated recently or no timestamp. Proceeding with validation.');
        // Proceed to validate token because storedUserString exists, is parsable, and it's not recently validated.
        try {
          console.log('AuthContext: Calling /api/auth/validate-token');
          const response = await apiFetch('/api/auth/validate-token');
          if (response && response.user) {
            console.log('AuthContext: /api/auth/validate-token successful. User:', response.user);
            setUser(response.user);
            localStorage.setItem('authUser', JSON.stringify(response.user));
            // Update timestamp in sessionStorage after successful validation using our safe helper
            const timestampSaved = setSessionItem('sessionLastValidatedAt', Date.now().toString());
            console.log('AuthContext: Session timestamp saved successfully:', timestampSaved);
          } else {
            console.warn('AuthContext: /api/auth/validate-token responded but without user data or token was invalid. Clearing session.', { response });
            setUser(null);
            localStorage.removeItem('authUser');
            removeSessionItem('sessionLastValidatedAt'); // Clear from sessionStorage
            // Avoid toast if it was just an invalid token on load without prior optimistic user
            if (parsedUserForValidation) { // Only toast if user was expecting to be logged in
                 toast.info('Your session may have ended. Please log in again.');
            }
          }
        } catch (error: any) {
          console.error('AuthContext: /api/auth/validate-token call failed. Status:', error.status, 'Message:', error.message, error);
          setUser(null);
          localStorage.removeItem('authUser');
          removeSessionItem('sessionLastValidatedAt'); // Clear from sessionStorage
          if (error.status === 401 && parsedUserForValidation) { // Only toast if user was expecting to be logged in
            toast.warn('Your session has expired. Please log in again.');
          } else if (error.status !== 401) {
            console.error('AuthContext: Session validation failed with non-401 error:', error.message);
          }
        }
      } else {
        console.log('AuthContext: No authUser in localStorage. User is not logged in.');
        setUser(null); 
        removeSessionItem('sessionLastValidatedAt'); // Clear timestamp from sessionStorage if no user
      }
      setIsLoading(false);
      console.log('AuthContext: Initial auth verification complete. isLoading:', false);
    };

    verifyAuthOnLoad();
  }, []); // navigate dependency removed as it's stable

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('authUser', JSON.stringify(userData));
    // On login, deliberately remove any existing validation timestamp to force a new validation
    removeSessionItem('sessionLastValidatedAt');
    console.log('AuthContext: User logged in, authUser stored. sessionLastValidatedAt cleared to force validation.');
  };

  const logout = async () => {
    setIsLoading(true);
    console.log('AuthContext: Logout initiated.');
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      toast.info('You have been logged out.');
    } catch (error: any) {
      console.error('AuthContext: Logout API call failed:', error.message);
      toast.error('Logout failed. Please try again.');
    } finally {
      setUser(null);
      localStorage.removeItem('authUser');
      removeSessionItem('sessionLastValidatedAt'); // Clear timestamp from sessionStorage on logout
      setIsLoading(false);
      navigate('/login');
      console.log('AuthContext: User logged out, authUser and sessionLastValidatedAt cleared.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner message="Loading MailVoyage for you..." />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

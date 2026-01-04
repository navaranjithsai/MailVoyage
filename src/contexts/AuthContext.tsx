import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiFetch } from '../lib/apiFetch';
import { performCompleteLogout } from '../lib/storageCleanup';
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
  // Debug utilities for tab-based session management
  getTabSessionInfo: () => { tabSessionId: string; isValidated: boolean; };
  clearTabValidation: () => void;
}

// Export context so other providers can use it directly (to avoid circular hook issues during HMR)
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  // Generate a unique session ID for this tab
  const generateTabSessionId = (): string => {
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Get or create tab session ID
  const getTabSessionId = (): string => {
    let tabSessionId = getSessionItem('tabSessionId');
    if (!tabSessionId) {
      tabSessionId = generateTabSessionId();
      setSessionItem('tabSessionId', tabSessionId);
      console.log('AuthContext: Generated new tab session ID:', tabSessionId);
    }
    return tabSessionId;
  };

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

  // Helper functions for tab-based session management
  const getSessionValidationState = (tabSessionId: string): boolean => {
    const validatedKey = `sessionValidated_${tabSessionId}`;
    const isValidated = getSessionItem(validatedKey) === 'true';
    console.log(`AuthContext: Tab ${tabSessionId} validation state:`, isValidated);
    return isValidated;
  };

  const setSessionValidationState = (tabSessionId: string, isValid: boolean): void => {
    const validatedKey = `sessionValidated_${tabSessionId}`;
    if (isValid) {
      setSessionItem(validatedKey, 'true');
      console.log(`AuthContext: Marked tab ${tabSessionId} as validated`);
    } else {
      removeSessionItem(validatedKey);
      console.log(`AuthContext: Cleared validation for tab ${tabSessionId}`);
    }
  };

  // Clear all tab validation states (used on logout)
  const clearAllTabValidations = (): void => {
    try {
      const keys = Object.keys(sessionStorage);
      keys.forEach(key => {
        if (key.startsWith('sessionValidated_')) {
          removeSessionItem(key);
        }
      });
      console.log('AuthContext: Cleared all tab validation states');
    } catch (e) {
      console.error('AuthContext: Error clearing tab validations:', e);
    }
  };
  useEffect(() => {
    const verifyAuthOnLoad = async () => {
      console.log('AuthContext: verifyAuthOnLoad triggered.');
      const tabSessionId = getTabSessionId();
      const storedUserString = localStorage.getItem('authUser');
      
      console.log('AuthContext: Tab session ID:', tabSessionId);

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
          clearAllTabValidations(); // Clear all tab validation states
          setUser(null);
          setIsLoading(false); // Malformed user data, stop here.
          return;
        }

        // At this point, parsedUserForValidation is valid if no error was caught.
        // Check if this tab session was already validated
        const isSessionValidated = getSessionValidationState(tabSessionId);
        if (isSessionValidated) {
          console.log('AuthContext: Tab session already validated. Skipping /api/auth/validate-token call.');
          setIsLoading(false);
          return; // Skip API call
        }
        
        console.log('AuthContext: Tab session not validated yet. Proceeding with validation.');
        // Proceed to validate token because storedUserString exists, is parsable, and this tab hasn't been validated yet.
        try {
          console.log('AuthContext: Calling /api/auth/validate-token');
          const response = await apiFetch('/api/auth/validate-token');
          if (response && response.user) {
            console.log('AuthContext: /api/auth/validate-token successful. User:', response.user);
            setUser(response.user);
            localStorage.setItem('authUser', JSON.stringify(response.user));
            // Mark this tab session as validated
            setSessionValidationState(tabSessionId, true);
          } else {
            console.warn('AuthContext: /api/auth/validate-token responded but without user data or token was invalid. Clearing session.', { response });
            setUser(null);
            localStorage.removeItem('authUser');
            clearAllTabValidations(); // Clear all tab validation states
            // Avoid toast if it was just an invalid token on load without prior optimistic user
            if (parsedUserForValidation) { // Only toast if user was expecting to be logged in
                 toast.info('Your session may have ended. Please log in again.');
            }
          }
        } catch (error: any) {
          console.error('AuthContext: /api/auth/validate-token call failed. Status:', error.status, 'Message:', error.message, error);
          setUser(null);
          localStorage.removeItem('authUser');
          clearAllTabValidations(); // Clear all tab validation states
          if (error.status === 401 && parsedUserForValidation) { // Only toast if user was expecting to be logged in
            toast.warn('Your session has expired. Please log in again.');
          } else if (error.status !== 401) {
            console.error('AuthContext: Session validation failed with non-401 error:', error.message);
          }
        }
      } else {
        console.log('AuthContext: No authUser in localStorage. User is not logged in.');
        setUser(null); 
        clearAllTabValidations(); // Clear all tab validation states if no user
      }
      setIsLoading(false);
      console.log('AuthContext: Initial auth verification complete. isLoading:', false);
    };

    verifyAuthOnLoad();
  }, []); // navigate dependency removed as it's stable
  const login = (userData: User) => {
    const tabSessionId = getTabSessionId();
    setUser(userData);
    localStorage.setItem('authUser', JSON.stringify(userData));
    // On login, mark this tab session as validated since we just authenticated
    setSessionValidationState(tabSessionId, true);
    console.log('AuthContext: User logged in, authUser stored. Tab session marked as validated.');
  };
  const logout = async () => {
    setIsLoading(true);
    console.log('AuthContext: Logout initiated.');
    
    try {
      // Call logout API first (to invalidate server-side session/cookie)
      await apiFetch('/api/auth/logout', { method: 'POST' });
      console.log('AuthContext: Logout API call successful');
    } catch (error: any) {
      console.error('AuthContext: Logout API call failed:', error.message);
      // Continue with local cleanup even if API fails
    }
    
    try {
      // Perform complete cleanup of all local data
      console.log('AuthContext: Performing complete local data cleanup...');
      await performCompleteLogout();
      console.log('AuthContext: Complete cleanup finished');
    } catch (cleanupError) {
      console.error('AuthContext: Error during cleanup:', cleanupError);
      // Fallback: at minimum clear the essential items
      localStorage.removeItem('authUser');
      localStorage.removeItem('emailAccounts');
      localStorage.removeItem('smtpAccounts');
      clearAllTabValidations();
    }
    
    // Reset state
    setUser(null);
    setIsLoading(false);
    
    // Show success message and navigate
    toast.info('You have been logged out successfully.');
    navigate('/login');
    console.log('AuthContext: User logged out, all data cleared.');
  };
  // Debug utilities for tab-based session management
  const getTabSessionInfo = () => {
    const tabSessionId = getTabSessionId();
    const isValidated = getSessionValidationState(tabSessionId);
    return { tabSessionId, isValidated };
  };

  const clearTabValidation = () => {
    const tabSessionId = getTabSessionId();
    setSessionValidationState(tabSessionId, false);
    console.log('AuthContext: Manually cleared tab validation for current tab');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner message="Loading MailVoyage for you..." />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated: !!user, 
      user, 
      login, 
      logout, 
      isLoading,
      getTabSessionInfo,
      clearTabValidation
    }}>
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

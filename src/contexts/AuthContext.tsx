import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify'; // Assuming toast utility is set up
import { jwtDecode } from 'jwt-decode'; // Import jwt-decode

interface User {
  username: string;
  email: string;
  // Add other user properties as needed
}

interface DecodedToken {
  userId: string;
  email: string;
  username: string;
  exp: number; // Expiration time (Unix timestamp)
  iat: number; // Issued at time (Unix timestamp)
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  login: (userData: User, token: string) => void;
  logout: () => void;
  isLoading: boolean; // To handle initial auth check
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start loading initially
  const navigate = useNavigate(); // Use navigate for programmatic redirection

  useEffect(() => {
    // Check local storage for existing token and user data on initial load
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');

    if (storedToken && storedUser) {
      try {
        const decodedToken: DecodedToken = jwtDecode(storedToken);
        const currentTime = Date.now() / 1000; // Convert ms to seconds

        if (decodedToken.exp > currentTime) {
          // Token is valid and not expired
          const parsedUser: User = JSON.parse(storedUser);
          // Optional: Verify user data from token matches stored user data
          if (parsedUser.email === decodedToken.email) {
             setUser(parsedUser);
             setToken(storedToken);
          } else {
             console.error("Stored user data mismatch with token data.");
             // Clear inconsistent state
             localStorage.removeItem('authToken');
             localStorage.removeItem('authUser');
          }
        } else {
          // Token is expired
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          toast.info('Your session has expired. Please log in again.');
          // No need to navigate here, the ProtectedRoute will handle it if needed
        }
      } catch (error) {
        console.error("Failed to parse user data or decode token", error);
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
      }
    }
    setIsLoading(false); // Finished initial check
  }, []);

  const login = (userData: User, authToken: string) => {
    localStorage.setItem('authUser', JSON.stringify(userData));
    localStorage.setItem('authToken', authToken);
    setUser(userData);
    setToken(authToken);
    // Navigation is handled by the LoginPage component after successful login
  };

  const logout = () => {
    localStorage.removeItem('authUser');
    localStorage.removeItem('authToken');
    setUser(null);
    setToken(null);
    navigate('/login'); // Redirect to login page on logout
  };

  // Prevent rendering children until initial auth check is complete
  if (isLoading) {
      // Optional: Render a loading spinner or skeleton screen
      return <div>Loading...</div>;
  }


  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token, user, token, login, logout, isLoading }}>
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

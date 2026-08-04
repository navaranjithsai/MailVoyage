import React from 'react';
import { BrowserRouter } from 'react-router'; // Import BrowserRouter
import AppRouter from './router';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { EmailProvider } from './contexts/EmailContext';
import { SyncProvider } from './contexts/SyncContext';
import { ServerStatusProvider } from './contexts/ServerStatusContext';
import ServerStatusOverlay from './components/status/ServerStatusOverlay';
import { ToastContainer } from 'react-toastify';
import { defaultToastOptions } from './lib/toast';

function App() {
  return (
    <React.StrictMode>
      {/* Wrap everything with BrowserRouter */}
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <SyncProvider>
              <EmailProvider>
                <ServerStatusProvider>
                  <AppRouter />
                  <ServerStatusOverlay />
                  <ToastContainer {...defaultToastOptions} />
                </ServerStatusProvider>
              </EmailProvider>
            </SyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

export default App;

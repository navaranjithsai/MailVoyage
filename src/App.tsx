import React from 'react';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import AppRouter from './router';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { EmailProvider } from './contexts/EmailContext';
import { ToastContainer } from 'react-toastify';
import { defaultToastOptions } from './lib/toast';

function App() {
  return (
    <React.StrictMode>
      {/* Wrap everything with BrowserRouter */}
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <EmailProvider>
              <AppRouter />
              <ToastContainer {...defaultToastOptions} />
            </EmailProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

export default App;

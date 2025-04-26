import React from 'react';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import AppRouter from './router';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastContainer } from 'react-toastify';
import { defaultToastOptions } from './lib/toast';

function App() {
  return (
    <React.StrictMode>
      {/* Wrap everything with BrowserRouter */}
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AppRouter />
            <ToastContainer {...defaultToastOptions} />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

export default App;

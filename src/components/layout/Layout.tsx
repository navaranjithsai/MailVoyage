import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Flowbar from './Flowbar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isFlowbarEnabled, setIsFlowbarEnabled] = useState(false);
  const [canUseFlowbar, setCanUseFlowbar] = useState(false);
  const location = useLocation();

  // Check if current route should show navigation
  const shouldShowNavigation = () => {
    const publicRoutes = ['/login', '/register', '/forgot-password'];
    return !publicRoutes.includes(location.pathname);
  };

  // Check screen width for flowbar compatibility
  useEffect(() => {
    const checkScreenWidth = () => {
      const width = window.innerWidth;
      const isTabletOrDesktop = width >= 1024;
      setCanUseFlowbar(isTabletOrDesktop);
    };

    checkScreenWidth();
    window.addEventListener('resize', checkScreenWidth);
    
    return () => window.removeEventListener('resize', checkScreenWidth);
  }, []);

  // Load user preference from localStorage on mount
  useEffect(() => {
    if (canUseFlowbar) {
      const savedPreference = localStorage.getItem('mailVoyage_useFlowbar');
      if (savedPreference === 'true') {
        setIsFlowbarEnabled(true);
      }
    }
  }, [canUseFlowbar]);

  // Disable flowbar if screen becomes too small
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024 && isFlowbarEnabled) {
      setIsFlowbarEnabled(false);
    }
  }, [isFlowbarEnabled]);

  const toggleFlowbar = () => {
    if (canUseFlowbar) {
      const newState = !isFlowbarEnabled;
      setIsFlowbarEnabled(newState);
      // Save preference to localStorage
      localStorage.setItem('mailVoyage_useFlowbar', newState.toString());
    }
  };

  const disableFlowbar = () => {
    setIsFlowbarEnabled(false);
    localStorage.setItem('mailVoyage_useFlowbar', 'false');
  };

  if (!shouldShowNavigation()) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen w-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden">
      {/* Sidebar - Always available, hidden when flowbar is enabled on desktop */}
      <Sidebar 
        isFlowbarEnabled={isFlowbarEnabled} 
        onToggleFlowbar={toggleFlowbar}
        canUseFlowbar={canUseFlowbar}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 w-0">
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-800">
          <div className="p-6 min-h-full w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Flowbar - Only on desktop (1024px+) when enabled */}
      {isFlowbarEnabled && canUseFlowbar && typeof window !== 'undefined' && window.innerWidth >= 1024 && (
        <Flowbar onDisable={disableFlowbar} />
      )}
    </div>
  );
};

export default Layout;

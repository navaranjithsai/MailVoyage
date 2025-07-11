import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Flowbar from './Flowbar';
import { STORAGE_KEYS, isDesktopWidth } from '@/lib/navigation';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isFlowbarEnabled, setIsFlowbarEnabled] = useState(false);
  const [canUseFlowbar, setCanUseFlowbar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Initialize sidebar state from localStorage or default based on screen size
    if (typeof window !== 'undefined') {
      const isDesktopScreen = isDesktopWidth();
      const savedState = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
      return isDesktopScreen ? (savedState === 'true' ? true : false) : true;
    }
    return true;
  });
  const [flowbarExpanded, setFlowbarExpanded] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  // Check if current route should show navigation
  const shouldShowNavigation = () => {
    const publicRoutes = ['/login', '/register', '/forgot-password'];
    return !publicRoutes.includes(location.pathname);
  };

  // Check screen width for flowbar compatibility
  useEffect(() => {
    const checkScreenWidth = () => {
      setCanUseFlowbar(isDesktopWidth());
    };

    checkScreenWidth();
    window.addEventListener('resize', checkScreenWidth);
    
    return () => window.removeEventListener('resize', checkScreenWidth);
  }, []);

  // Load user preference from localStorage on mount
  useEffect(() => {
    if (canUseFlowbar) {
      const savedPreference = localStorage.getItem(STORAGE_KEYS.FLOWBAR_ENABLED);
      if (savedPreference === 'true') {
        setIsFlowbarEnabled(true);
      }
    }
  }, [canUseFlowbar]);

  // Save sidebar state to localStorage
  useEffect(() => {
    if (isDesktopWidth()) {
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, sidebarCollapsed.toString());
    }
  }, [sidebarCollapsed]);

  // Disable flowbar if screen becomes too small
  useEffect(() => {
    if (!isDesktopWidth() && isFlowbarEnabled) {
      setIsFlowbarEnabled(false);
    }
  }, [isFlowbarEnabled]);

  // Centralized keyboard shortcuts: alt+c toggles collapse/expand, alt+s opens search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyC') {
        e.preventDefault(); // Prevent any default browser behavior
        
        if (isFlowbarEnabled && canUseFlowbar && isDesktopWidth()) {
          // If flowbar is active, toggle flowbar expansion
          setFlowbarExpanded(prev => !prev);
        } else {
          // Otherwise, toggle sidebar collapse
          setSidebarCollapsed(prev => !prev);
        }
      } else if (e.altKey && e.code === 'KeyS') {
        e.preventDefault(); // Prevent any default browser behavior
        
        // Navigate to search page
        navigate('/search');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlowbarEnabled, canUseFlowbar, navigate]);

  // Centralized toggle functions
  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  const toggleFlowbarExpansion = () => {
    setFlowbarExpanded(prev => !prev);
  };

  const toggleFlowbar = () => {
    if (canUseFlowbar) {
      const newState = !isFlowbarEnabled;
      setIsFlowbarEnabled(newState);
      // Save preference to localStorage
      localStorage.setItem(STORAGE_KEYS.FLOWBAR_ENABLED, newState.toString());
    }
  };

  const disableFlowbar = () => {
    setIsFlowbarEnabled(false);
    localStorage.setItem(STORAGE_KEYS.FLOWBAR_ENABLED, 'false');
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
        isCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
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
      {isFlowbarEnabled && canUseFlowbar && isDesktopWidth() && (
        <Flowbar 
          onDisable={disableFlowbar} 
          isExpanded={flowbarExpanded}
          onToggleExpansion={toggleFlowbarExpansion}
        />
      )}
    </div>
  );
};

export default Layout;

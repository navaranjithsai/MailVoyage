import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { 
  PanelRightClose, 
  PanelRightOpen, 
  LogOut,
  ChevronDown,
  Sparkles,
  Info,
  Monitor
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useEmail } from '@/contexts/EmailContext';
import { 
  getNavigationItems, 
  themeOptions, 
  STORAGE_KEYS, 
  isDesktopWidth, 
  isMobileTabletWidth, 
  isSsrSafe 
} from '@/lib/navigation';
import logoSvg from '@/assets/logo.svg';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: number;
}

interface SidebarProps {
  isFlowbarEnabled: boolean;
  onToggleFlowbar: () => void;
  canUseFlowbar: boolean;
  isCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

// Tooltip component that renders at document root
const Tooltip: React.FC<{
  isVisible: boolean;
  targetRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}> = ({ isVisible, targetRef, children }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isVisible || !targetRef.current) return;
    
    const target = targetRef.current;
    
    const updatePosition = () => {
      const rect = target.getBoundingClientRect();
      if (rect) {
        setPosition({
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [isVisible, targetRef.current]); // Use targetRef.current instead of targetRef object

  if (!isVisible) return null;

  return (
    <div
      className="fixed pointer-events-none z-9999 transition-opacity duration-200"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="px-2 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm rounded whitespace-nowrap shadow-lg border border-gray-200 dark:border-gray-600 
                      before:content-[''] before:absolute before:top-1/2 before:-translate-y-1/2 before:-left-1 before:border-4 before:border-transparent before:border-r-gray-900 dark:before:border-r-gray-100">
        {children}
      </div>
    </div>
  );
};

const SidebarComponent: React.FC<SidebarProps> = ({ 
  isFlowbarEnabled, 
  onToggleFlowbar, 
  canUseFlowbar,
  isCollapsed: externalIsCollapsed,
  onToggleSidebar: externalOnToggleSidebar
}) => {
  // Use external state if provided, otherwise use internal state for backward compatibility
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(() => {
    // For devices below 1024px, collapsed by default. For 1024px+, expanded by default
    if (isSsrSafe()) {
      const isDesktopScreen = isDesktopWidth();
      const savedState = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
      return isDesktopScreen ? (savedState === 'true' ? true : false) : true;
    }
    return true;
  });

  const isCollapsed = externalIsCollapsed !== undefined ? externalIsCollapsed : internalIsCollapsed;
  const toggleSidebar = externalOnToggleSidebar || (() => setInternalIsCollapsed(!internalIsCollapsed));
  const [showThemeSection, setShowThemeSection] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);
  
  // Refs for tooltip positioning
  const themeButtonRef = useRef<HTMLButtonElement | null>(null);
  const flowbarButtonRef = useRef<HTMLButtonElement | null>(null);
  const logoutButtonRef = useRef<HTMLButtonElement | null>(null);
  const collapseButtonRef = useRef<HTMLButtonElement | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const navItemRefs = useRef<{ [key: string]: HTMLAnchorElement | null }>({});
  
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { unreadCount, showUnreadBadge } = useEmail();
  
  const sidebarItems: SidebarItem[] = getNavigationItems(unreadCount);

  // Save collapsed state to localStorage (only for internal state)
  useEffect(() => {
    if (externalIsCollapsed === undefined && isDesktopWidth()) {
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, internalIsCollapsed.toString());
    }
  }, [internalIsCollapsed, externalIsCollapsed]);

  // Handle screen size changes (only for internal state management)
  useEffect(() => {
    if (externalIsCollapsed === undefined) {
      // Only handle resize if using internal state
      const handleResize = () => {
        const isDesktop = isDesktopWidth();
        if (!isDesktop && !internalIsCollapsed) {
          // On small screens, if sidebar is expanded, keep it as overlay
          return;
        }
        // Update collapsed state based on screen size if no user preference
        if (!localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED)) {
          setInternalIsCollapsed(!isDesktop);
        }
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [internalIsCollapsed, externalIsCollapsed]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleThemeChange = (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);
    if (isCollapsed) {
      // If collapsed, cycle through themes on click
      const currentIndex = themeOptions.findIndex(opt => opt.id === theme);
      const nextIndex = (currentIndex + 1) % themeOptions.length;
      setTheme(themeOptions[nextIndex].id as any);
    }
  };

  const getCurrentThemeIcon = () => {
    const currentOption = themeOptions.find(opt => opt.id === theme);
    return currentOption ? currentOption.icon : Monitor;
  };

  const sidebarVariants = {
    expanded: {
      width: isDesktopWidth() ? '20%' : '280px',
      transition: {
        type: 'spring' as const,
        stiffness: 400,
        damping: 35,
        mass: 1.2,
      },
    },
    collapsed: {
      width: isDesktopWidth() ? '69px' : '65px',
      transition: {
        type: 'spring' as const,
        stiffness: 400,
        damping: 35,
        mass: 1.2,
      },
    },
  };

  const overlayVariants = {
    visible: {
      opacity: 1,
      backdropFilter: 'blur(4px)',
      transition: { duration: 0.2 },
    },
    hidden: {
      opacity: 0,
      backdropFilter: 'blur(0px)',
      transition: { duration: 0.2 },
    },
  };

  const themeVariants = {
    open: {
      height: 'auto',
      opacity: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 30,
      },
    },
    closed: {
      height: 0,
      opacity: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 30,
      },
    },
  };

  // Don't render sidebar when flowbar is enabled on desktop (1024px+)
  if (isFlowbarEnabled && isDesktopWidth()) {
    return null;
  }

  return (
    <>
      {/* Mobile/Tablet Overlay */}
      <AnimatePresence>
        {isMobileTabletWidth() && !isCollapsed && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={toggleSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={`
          ${isMobileTabletWidth() && !isCollapsed ? 'fixed' : 'relative'} top-0 left-0 h-screen bg-white dark:bg-gray-900 
          border-r border-gray-200 dark:border-gray-700 z-50 
          flex flex-col shadow-xl ${isMobileTabletWidth() ? '' : 'shadow-none'} 
          shrink-0
        `}
        variants={sidebarVariants}
        animate={isCollapsed ? 'collapsed' : 'expanded'}
        initial={isCollapsed ? 'collapsed' : 'expanded'}
      >
        {/* Header */}
        <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700">
          {isCollapsed ? (
            <div className="w-full flex justify-center">
              <button
                ref={expandButtonRef}
                onClick={toggleSidebar}
                onMouseEnter={() => setHoveredTooltip('expand')}
                onMouseLeave={() => setHoveredTooltip(null)}
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
              >
                <PanelRightClose className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex items-center space-x-3 flex-1"
              >
                <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center overflow-hidden">
                  {logoLoaded ? (
                    <img 
                      src={logoSvg} 
                      alt="MailVoyage" 
                      className="w-full h-full object-contain"
                      onLoad={() => setLogoLoaded(true)}
                      onError={() => setLogoLoaded(false)}
                    />
                  ) : (
                    <>
                      <img 
                        src={logoSvg} 
                        alt="MailVoyage" 
                        className="w-full h-full object-contain opacity-0 absolute"
                        onLoad={() => setLogoLoaded(true)}
                        onError={() => setLogoLoaded(false)}
                      />
                      <span className="text-white font-bold text-sm">MV</span>
                    </>
                  )}
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">MailVoyage</span>
              </motion.div>
              
              <button
                ref={collapseButtonRef}
                onClick={toggleSidebar}
                onMouseEnter={() => setHoveredTooltip('collapse')}
                onMouseLeave={() => setHoveredTooltip(null)}
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 ml-auto"
              >
                <PanelRightOpen className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">{sidebarItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <div key={item.id} className="relative">
                <Link
                  ref={(el) => { navItemRefs.current[item.id] = el; }}
                  to={item.path}
                  onMouseEnter={isCollapsed ? () => setHoveredTooltip(item.id) : undefined}
                  onMouseLeave={isCollapsed ? () => setHoveredTooltip(null) : undefined}
                  className={`
                    flex items-center px-3 py-3 rounded-lg text-sm font-medium
                    transition-all duration-200 relative group
                    ${isActive 
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                    ${isCollapsed ? 'justify-center' : 'justify-start space-x-3'}
                  `}
                >
                  <div className="relative">
                    <Icon className="w-5 h-5 shrink-0" />
                    {/* Red dot for unread emails - only for inbox and if notifications are enabled */}
                    {item.id === 'inbox' && item.badge && showUnreadBadge && (
                      <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-gray-800"></div>
                    )}
                  </div>
                  
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.2 }}
                        className="truncate"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              </div>
            );
          })}
        </nav>

        {/* Theme Section */}
        <div className="border-t border-gray-200 dark:border-gray-700">
          {isCollapsed ? (
            // Collapsed state - single theme icon that cycles
            <div className="p-2">
              <button
                ref={themeButtonRef}
                onClick={() => handleThemeChange(theme)}
                onMouseEnter={() => setHoveredTooltip('theme')}
                onMouseLeave={() => setHoveredTooltip(null)}
                className="w-full flex items-center justify-center p-3 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group relative"
              >
                {React.createElement(getCurrentThemeIcon(), { className: "w-5 h-5" })}
              </button>
            </div>
          ) : (
            // Expanded state - theme section with options
            <div className="bg-gray-50 dark:bg-gray-800/50 m-2 rounded-lg">
              <button
                onClick={() => setShowThemeSection(!showThemeSection)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
              >
                <div className="flex items-center space-x-3">
                  {React.createElement(getCurrentThemeIcon(), { className: "w-5 h-5" })}
                  <span>Theme</span>
                </div>
                <motion.div
                  animate={{ rotate: showThemeSection ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-4 h-4" />
                </motion.div>
              </button>

              <AnimatePresence>
                {showThemeSection && (
                  <motion.div
                    variants={themeVariants}
                    initial="closed"
                    animate="open"
                    exit="closed"
                    className="overflow-hidden"
                  >
                    <div className="px-2 pb-2 space-y-1">
                      {themeOptions.map((option) => {
                        const Icon = option.icon;
                        const isActive = theme === option.id;
                        
                        return (
                          <button
                            key={option.id}
                            onClick={() => setTheme(option.id as any)}
                            className={`
                              w-full flex items-center space-x-3 px-3 py-2 rounded text-sm
                              transition-colors duration-200
                              ${isActive 
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' 
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }
                            `}
                          >
                            <Icon className="w-4 h-4" />
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Flowbar Toggle Section - Only show on desktop (1024px+) */}
        {isDesktopWidth() && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {isCollapsed ? (
              <div className="p-2">
                <button
                  ref={flowbarButtonRef}
                  onClick={canUseFlowbar ? onToggleFlowbar : undefined}
                  onMouseEnter={() => setHoveredTooltip('flowbar')}
                  onMouseLeave={() => setHoveredTooltip(null)}
                  disabled={!canUseFlowbar}
                  className={`
                    w-full flex items-center justify-center p-3 rounded-lg transition-colors duration-200 group relative
                    ${canUseFlowbar
                      ? 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer'
                      : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    }
                  `}
                >
                  <Sparkles className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="p-2">
                <button
                  onClick={canUseFlowbar ? onToggleFlowbar : undefined}
                  disabled={!canUseFlowbar}
                  className={`
                    w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors duration-200
                    ${canUseFlowbar
                      ? 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer'
                      : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    }
                  `}
                >
                  <Sparkles className="w-5 h-5" />
                  <span>Enable Flowbar</span>
                  {!canUseFlowbar && <Info className="w-4 h-4 ml-auto" />}
                </button>
                {!canUseFlowbar && (
                  <p className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                    Switch to desktop or tablet to use Flowbar
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Logout Button */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-2">
          <button
            ref={logoutButtonRef}
            onClick={handleLogout}
            onMouseEnter={isCollapsed ? () => setHoveredTooltip('logout') : undefined}
            onMouseLeave={isCollapsed ? () => setHoveredTooltip(null) : undefined}
            className={`
              w-full flex items-center px-3 py-3 rounded-lg text-sm font-medium
              text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20
              transition-colors duration-200 group relative
              ${isCollapsed ? 'justify-center' : 'justify-start space-x-3'}
            `}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  Logout
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* Portal tooltips rendered at document root for proper overlay positioning */}
      {typeof document !== 'undefined' && createPortal(
        <>
          {/* Collapsed sidebar tooltips */}
          {isCollapsed && (
            <>
              {/* Navigation item tooltips */}
              {sidebarItems.map((item) => (
                <Tooltip
                  key={`${item.id}-tooltip`}
                  isVisible={hoveredTooltip === item.id}
                  targetRef={{ current: navItemRefs.current[item.id] as HTMLElement | null }}
                >
                  <div>
                    {item.label}
                    {item.id === 'search' && (
                      <div className="text-xs text-gray-300 dark:text-gray-600 mt-1">alt+s</div>
                    )}
                  </div>
                </Tooltip>
              ))}

              {/* Theme button tooltip */}
              <Tooltip
                isVisible={hoveredTooltip === 'theme'}
                targetRef={themeButtonRef as React.RefObject<HTMLElement | null>}
              >
                Theme
              </Tooltip>

              {/* Flowbar button tooltip */}
              {isDesktopWidth() && (
                <Tooltip
                  isVisible={hoveredTooltip === 'flowbar'}
                  targetRef={flowbarButtonRef as React.RefObject<HTMLElement | null>}
                >
                  {canUseFlowbar ? 'Enable Flowbar' : 'Flowbar requires desktop'}
                </Tooltip>
              )}

              {/* Logout button tooltip */}
              <Tooltip
                isVisible={hoveredTooltip === 'logout'}
                targetRef={logoutButtonRef as React.RefObject<HTMLElement | null>}
              >
                Logout
              </Tooltip>

              {/* Expand button tooltip */}
              {hoveredTooltip === 'expand' && (
                <div
                  className="fixed pointer-events-none z-9999 transition-opacity duration-200"
                  style={{
                    top: expandButtonRef.current?.getBoundingClientRect().top! + expandButtonRef.current?.getBoundingClientRect().height! / 2,
                    left: expandButtonRef.current?.getBoundingClientRect().right! + 8,
                    transform: 'translateY(-50%)',
                  }}
                >
                  <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                    Expand
                    <div className="text-xs text-gray-300 dark:text-gray-600 mt-1">alt+c</div>
                    <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900 dark:border-r-gray-100" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Expanded sidebar tooltips */}
          {!isCollapsed && hoveredTooltip === 'collapse' && (
            <div
              className="fixed pointer-events-none z-9999 transition-opacity duration-200"
              style={{
                top: collapseButtonRef.current?.getBoundingClientRect().top! + collapseButtonRef.current?.getBoundingClientRect().height! / 2,
                left: collapseButtonRef.current?.getBoundingClientRect().right! + 8,
                transform: 'translateY(-50%)',
              }}
            >
              <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                Collapse
                <div className="text-xs text-gray-300 dark:text-gray-600 mt-1">alt+c</div>
                <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900 dark:border-r-gray-100" />
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
};

export default SidebarComponent;
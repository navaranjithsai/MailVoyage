import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut,
  X,
  Sun,
  Moon,
  Monitor,
  ChevronLeft
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useEmail } from '@/contexts/EmailContext'; 
import { getNavigationItems, tooltipVariants } from '@/lib/navigation';
import logoSvg from '@/assets/logo.svg';

interface FlowbarItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  path: string;
  badge?: number;
}

interface FlowbarProps {
  onDisable: () => void;
  isExpanded?: boolean;
  onToggleExpansion?: () => void;
}

const Flowbar: React.FC<FlowbarProps> = ({ 
  onDisable,
  isExpanded: externalIsExpanded,
  onToggleExpansion: externalOnToggleExpansion
}) => {
  // Use external state if provided, otherwise use internal state for backward compatibility
  const [internalIsExpanded, setInternalIsExpanded] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  const toggleExpansion = externalOnToggleExpansion || (() => setInternalIsExpanded(!internalIsExpanded));
  
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { unreadCount, showUnreadBadge } = useEmail();
  
  const flowbarItems: FlowbarItem[] = getNavigationItems(unreadCount);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleThemeChange = () => {
    // Cycle through themes: system -> light -> dark -> system
    const themeOrder: ('system' | 'light' | 'dark')[] = ['system', 'light', 'dark'];
    const currentIndex = themeOrder.indexOf(theme);
    const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length];
    setTheme(nextTheme);
  };

  const containerVariants = {
    expanded: {
      width: 'auto',
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 35,
        mass: 1.2,
        restDelta: 0.001,
      },
    },
    collapsed: {
      width: 'auto',
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 35,
        mass: 1.2,
        restDelta: 0.001,
      },
    },
  };

  const itemVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: { 
      scale: 1, 
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 500,
        damping: 28,
        mass: 1,
        velocity: 2,
      },
    },
  };

  return (
    <motion.div
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
    >
      <motion.div
        className={`
          relative bg-gray-100/95 dark:bg-gray-900/90 backdrop-blur-xl 
          border border-gray-200/50 dark:border-gray-700/50
          rounded-2xl shadow-2xl p-3
          before:absolute before:inset-0 before:rounded-2xl 
          before:bg-gradient-to-r before:from-white/20 before:to-transparent 
          before:pointer-events-none dark:before:from-gray-800/20
        `}
        variants={containerVariants}
        animate={isExpanded ? 'expanded' : 'collapsed'}
        style={{
          boxShadow: `
            0 20px 40px -10px rgba(0, 0, 0, 0.15),
            0 10px 20px -5px rgba(0, 0, 0, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.15),
            0 0 15px rgba(0, 0, 0, 0.05)
          `,
        }}
      >
        <div className="flex items-center space-x-2">
          {/* Menu/Collapse Button with keyboard tooltip */}
          <motion.div
            className="relative"
            onMouseEnter={() => setHoveredItem('menu')}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <motion.button
              onClick={toggleExpansion}
              className={`
                relative flex items-center justify-center w-12 h-12 
                rounded-xl bg-gradient-to-br from-blue-500 to-purple-600
                text-white shadow-lg hover:shadow-xl
                transition-all duration-300 group overflow-hidden
              `}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              
              <AnimatePresence mode="wait">
                {isExpanded ? (
                  <motion.div
                    key="menu"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="minimize"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-center"
                  >
                    {logoLoaded ? (
                      <img 
                        src={logoSvg} 
                        alt="MailVoyage" 
                        className="w-6 h-6 object-contain"
                        onLoad={() => setLogoLoaded(true)}
                        onError={() => setLogoLoaded(false)}
                      />
                    ) : (
                      <>
                        <img 
                          src={logoSvg} 
                          alt="MailVoyage" 
                          className="w-6 h-6 object-contain opacity-0 absolute"
                          onLoad={() => setLogoLoaded(true)}
                          onError={() => setLogoLoaded(false)}
                        />
                        <span className="text-white font-bold text-sm">MV</span>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Shortcut Tooltip for menu */}
            <AnimatePresence>
              {hoveredItem === 'menu' && (
                <motion.div
                  className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 text-center"
                  variants={tooltipVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                >
                  <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                    {isExpanded ? 'Collapse' : 'Expand'}
                    <div className="text-xs text-gray-300 mt-1">alt+c</div>
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Navigation Items */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                className="flex items-center space-x-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ 
                  duration: 0.3,
                  staggerChildren: 0.05,
                }}
              >
                {flowbarItems.map((item, index) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  
                  return (
                    <motion.div
                      key={item.id}
                      className="relative"
                      variants={itemVariants}
                      initial="hidden"
                      animate="visible"
                      transition={{ delay: index * 0.05 }}
                      onMouseEnter={() => setHoveredItem(item.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <Link
                        to={item.path}
                        className={`
                          relative flex items-center justify-center w-12 h-12 
                          rounded-xl transition-all duration-200 group overflow-hidden
                          ${isActive 
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-md' 
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100'
                          }
                        `}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                        
                        <Icon className="w-5 h-5 relative z-10" />
                        
                        {/* Badge */}
                        {item.badge && item.badge > 0 && showUnreadBadge && (
                          <motion.div
                            className="absolute top-1 right-1 bg-red-500 rounded-full w-2.5 h-2.5 border border-white dark:border-gray-800"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ 
                              type: 'spring',
                              stiffness: 400,
                              damping: 25,
                              delay: 0.2,
                            }}
                          />
                        )}
                      </Link>

                      {/* Tooltip for navigation items */}
                      <AnimatePresence>
                        {hoveredItem === item.id && (
                          <motion.div
                            className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2"
                            variants={tooltipVariants}
                            initial="hidden"
                            animate="visible"
                            exit="hidden"
                          >
                            <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                              <div>
                                {item.id === 'inbox' ? 'Inbox' : item.label}
                                {item.id === 'search' && (
                                  <div className="text-xs text-gray-300 dark:text-gray-600 mt-1">alt+s</div>
                                )}
                              </div>
                            </div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}

                {/* Separator */}
                <motion.div
                  className="w-px h-8 bg-gray-300 dark:bg-gray-600"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.2 }}
                />

                {/* Action Buttons */}
                <motion.div
                  className="flex items-center space-x-2"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 }}                
                >
                  {/* Theme Button */}
                  <motion.div
                    className="relative"
                    onMouseEnter={() => setHoveredItem('theme')}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <motion.button
                      onClick={handleThemeChange}
                      className="relative flex items-center justify-center w-12 h-12 rounded-xl text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all duration-200 group overflow-hidden"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      {theme === 'system' && <Monitor className="w-5 h-5 relative z-10" />}
                      {theme === 'light' && <Sun className="w-5 h-5 relative z-10" />}
                      {theme === 'dark' && <Moon className="w-5 h-5 relative z-10" />}
                    </motion.button>

                    <AnimatePresence>
                      {hoveredItem === 'theme' && (
                        <motion.div
                          className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2"
                          initial={{ opacity: 0, y: 10, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        >
                          <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                            Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* Logout Button */}
                  <motion.div
                    className="relative"
                    onMouseEnter={() => setHoveredItem('logout')}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <motion.button
                      onClick={handleLogout}
                      className="relative flex items-center justify-center w-12 h-12 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 group overflow-hidden"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      <LogOut className="w-5 h-5 relative z-10" />
                    </motion.button>

                    <AnimatePresence>
                      {hoveredItem === 'logout' && (
                        <motion.div
                          className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2"
                          variants={tooltipVariants}
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                        >
                          <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                            Logout
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* Exit Flowbar Button */}
                  <motion.div
                    className="relative"
                    onMouseEnter={() => setHoveredItem('exit')}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <motion.button
                      onClick={onDisable}
                      className="relative flex items-center justify-center w-12 h-12 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-all duration-200 group overflow-hidden"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      <X className="w-5 h-5 relative z-10" />
                    </motion.button>

                    <AnimatePresence>
                      {hoveredItem === 'exit' && (
                        <motion.div
                          className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2"
                          variants={tooltipVariants}
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                        >
                          <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                            Exit Flowbar
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Flowbar;

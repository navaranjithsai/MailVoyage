import { 
  Edit, 
  FileText,
  Inbox, 
  LayoutDashboard, 
  Search,
  Send,
  Settings,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { NavigationItem } from '@/contexts/EmailContext';

// Shared navigation items for both Sidebar and Flowbar
export const getNavigationItems = (unreadCount: number): NavigationItem[] => [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'compose', label: 'Compose', icon: Edit, path: '/compose' },
  { id: 'search', label: 'Search', icon: Search, path: '/search' },
  { id: 'inbox', label: 'Inbox', icon: Inbox, path: '/inbox', badge: unreadCount > 0 ? unreadCount : undefined },
  { id: 'sent', label: 'Sent', icon: Send, path: '/sent' },
  { id: 'drafts', label: 'Drafts', icon: FileText, path: '/drafts' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
];

// Shared theme options
export const themeOptions = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

// Shared animation variants
export const tooltipVariants = {
  hidden: { 
    opacity: 0, 
    y: 10, 
    scale: 0.9 
  },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 25,
    },
  },
};

export const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

// Shared utility functions
export const formatTimeAgo = (timestamp: Date): string => {
  const now = new Date();
  const diffInMs = now.getTime() - timestamp.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;
  
  // For older emails, show actual date
  return timestamp.toLocaleDateString();
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

// Shared utility constants
export const DESKTOP_BREAKPOINT = 1024;
export const STORAGE_KEYS = {
  FLOWBAR_ENABLED: 'useFlowbar',
  SIDEBAR_COLLAPSED: 'sidebarCollapsed'
} as const;

// Shared utility functions for screen detection
export const isDesktopWidth = () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT;
export const isMobileTabletWidth = () => typeof window !== 'undefined' && window.innerWidth < DESKTOP_BREAKPOINT;
export const isSsrSafe = () => typeof window !== 'undefined';

// Keyboard shortcut constants
export const KEYBOARD_SHORTCUTS = {
  TOGGLE_NAVIGATION: 'alt+c',
  OPEN_SEARCH: 'alt+s'
} as const;

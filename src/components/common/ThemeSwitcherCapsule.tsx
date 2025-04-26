import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Settings, Sun, Moon } from 'lucide-react';
import Button from '@/components/ui/Button'; // Assuming you have a basic Button component

export function ThemeSwitcherCapsule() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close capsule when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [switcherRef]);

  const handleToggle = () => setIsExpanded(!isExpanded);

  const handleThemeChange = (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);
    setIsExpanded(false); // Close after selection
  };

  const getIcon = (themeValue: string | null) => {
    switch (themeValue) {
      case 'light': return <Sun size={18} />;
      case 'dark': return <Moon size={18} />;
      default: return <Settings size={18} />; // System or initial
    }
  };

  return (
    <div
      ref={switcherRef}
      className="fixed top-5 right-5 z-50"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div
        className={`relative transition-all duration-300 ease-in-out rounded-full shadow-md border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm ${
          isExpanded ? 'p-2 w-auto h-auto' : 'p-0 w-10 h-10 flex items-center justify-center'
        }`}
        onClick={handleToggle}
      >
        {/* Trigger Button - always visible when collapsed */}
        {!isExpanded && (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full w-10 h-10 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            title={`Theme: ${resolvedTheme}`}
          >
            {getIcon(resolvedTheme)}
          </Button>
        )}

        {/* Expanded Capsule - visible when isExpanded is true */}
        {isExpanded && (
          <div className="flex flex-col items-center gap-2">
             {/* System Theme Button */}
             <Button
              variant={theme === 'system' ? 'secondary' : 'ghost'}
              size="icon"
              className="rounded-full w-8 h-8 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => handleThemeChange('system')}
              title="System Theme"
            >
              <Settings size={18} />
            </Button>
            {/* Light Theme Button */}
            <Button
              variant={theme === 'light' ? 'secondary' : 'ghost'}
              size="icon"
              className="rounded-full w-8 h-8 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => handleThemeChange('light')}
              title="Light Theme"
            >
              <Sun size={18} />
            </Button>
            {/* Dark Theme Button */}
            <Button
              variant={theme === 'dark' ? 'secondary' : 'ghost'}
              size="icon"
              className="rounded-full w-8 h-8 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => handleThemeChange('dark')}
              title="Dark Theme"
            >
              <Moon size={18} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
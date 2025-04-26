import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark"; // The actual theme being applied (light or dark)
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const applyTheme = (theme: "light" | "dark") => {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
};

const getSystemTheme = (): "light" | "dark" => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Get theme from local storage or default to system
    return (localStorage.getItem('theme') as Theme) || 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(
      theme === 'system' ? getSystemTheme() : theme
  );

  // Update resolved theme and apply class when theme changes or system preference changes
  useEffect(() => {
    const currentResolvedTheme = theme === 'system' ? getSystemTheme() : theme;
    setResolvedTheme(currentResolvedTheme);
    applyTheme(currentResolvedTheme);
    localStorage.setItem('theme', theme); // Store user preference

    // Listener for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
        if (theme === 'system') {
            const systemTheme = getSystemTheme();
            setResolvedTheme(systemTheme);
            applyTheme(systemTheme);
        }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);

  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

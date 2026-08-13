import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'afn-theme';

interface ThemeContextValue {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const lightQuery = '(prefers-color-scheme: light)';

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;

  const surface = theme === 'light' ? '#f4f5f8' : '#0a0a0a';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);

  if (Capacitor.isNativePlatform()) {
    // Style.Dark = light text (for dark surfaces), Style.Light = dark text
    StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark }).catch(() => {});
    if (Capacitor.getPlatform() === 'android') {
      StatusBar.setBackgroundColor({ color: surface }).catch(() => {});
    }
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
  });
  const [systemLight, setSystemLight] = useState(() => window.matchMedia(lightQuery).matches);

  const theme: ResolvedTheme =
    preference === 'system' ? (systemLight ? 'light' : 'dark') : preference;

  const setPreference = (pref: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, pref);
    setPreferenceState(pref);
  };

  useEffect(() => {
    const mq = window.matchMedia(lightQuery);
    const onChange = (e: MediaQueryListEvent) => setSystemLight(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

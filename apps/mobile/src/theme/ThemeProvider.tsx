import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { palette, font, radius, space, type Palette, type ThemeName } from './tokens';

export interface Theme {
  name: ThemeName;
  color: Palette;
  font: typeof font;
  radius: typeof radius;
  space: typeof space;
}

const ThemeContext = createContext<Theme | null>(null);

// Follows the OS light/dark setting, resolving to the @af1/tokens palette for that
// mode. Dark is the platform's home; light is a faithful override, not an inversion.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const name: ThemeName = scheme === 'light' ? 'light' : 'dark';
  const value = useMemo<Theme>(
    () => ({ name, color: palette(name), font, radius, space }),
    [name],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used within <ThemeProvider>');
  return theme;
}

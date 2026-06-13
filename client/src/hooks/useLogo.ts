import { useTheme } from '../contexts/ThemeContext';
import logoLime from '../assets/logo.svg';
import logoBlue from '../assets/logo-icon.svg';

/** Theme-aware logo: lime wordmark on dark, blue icon on light. */
export function useLogo(): string {
  const { theme } = useTheme();
  return theme === 'light' ? logoBlue : logoLime;
}

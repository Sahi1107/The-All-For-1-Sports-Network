// Typed access to the canonical tokens for consumers that want JS values —
// primarily the mobile app's theme. Web reads the CSS vars in index.css, which
// the drift-guard test keeps identical to tokens.json.
import tokens from '../tokens.json';

export type ThemeName = 'dark' | 'light';
export type ColorName = keyof typeof tokens.color;

export const fonts = tokens.fonts;
export const colors = tokens.color;

/** Resolve every colour token for a theme (falls back to the dark value where a
 *  token has no light override). Handy as a React Native theme object. */
export function theme(name: ThemeName): Record<ColorName, string> {
  const out = {} as Record<ColorName, string>;
  for (const key of Object.keys(tokens.color) as ColorName[]) {
    const entry = tokens.color[key] as { dark: string; light?: string };
    out[key] = (name === 'light' && entry.light) || entry.dark;
  }
  return out;
}

export const darkTheme = theme('dark');
export const lightTheme = theme('light');

export default tokens;

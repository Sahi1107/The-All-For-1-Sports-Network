import { theme as af1Theme, type ThemeName, type ColorName } from '@af1/tokens';

export type { ThemeName, ColorName };

/** The full colour palette for a theme, straight from @af1/tokens (the same
 *  source the web CSS variables are generated from, drift-guarded to match). */
export type Palette = Record<ColorName, string>;
export const palette = (name: ThemeName): Palette => af1Theme(name) as Palette;

// Font family names — these are the keys the root layout registers with expo-font
// (from @expo-google-fonts/*), so a `fontFamily` here always resolves to a loaded
// face. Roles mirror the web: Archivo for display, Inter for body, Saira for numerals.
export const font = {
  display: {
    bold: 'Archivo_700Bold',
    extrabold: 'Archivo_800ExtraBold',
    black: 'Archivo_900Black',
  },
  sans: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  numeric: {
    semibold: 'SairaSemiCondensed_600SemiBold',
    bold: 'SairaSemiCondensed_700Bold',
  },
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** 4-pt spacing scale. `space(3)` → 12. */
export const space = (n: number): number => n * 4;

/** A token colour at partial opacity — the RN equivalent of the web's `bg-primary/20`
 *  / `border-primary/25` idiom, which the card recipes lean on heavily. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

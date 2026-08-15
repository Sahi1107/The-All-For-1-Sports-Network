import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Variant = 'display' | 'title' | 'body' | 'label' | 'numeric';

interface TextProps extends RNTextProps {
  variant?: Variant;
  color?: string;
}

// Themed text so screens declare intent (variant) not mechanics (fontFamily +
// size + colour). Defaults to body/foreground; override colour with a token value.
const VARIANT: Record<Variant, (f: ReturnType<typeof useTheme>['font']) => TextStyle> = {
  display: (f) => ({ fontFamily: f.display.black, fontSize: 28, lineHeight: 32 }),
  title: (f) => ({ fontFamily: f.display.bold, fontSize: 18, lineHeight: 24 }),
  body: (f) => ({ fontFamily: f.sans.regular, fontSize: 15, lineHeight: 21 }),
  label: (f) => ({ fontFamily: f.sans.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.3 }),
  numeric: (f) => ({ fontFamily: f.numeric.bold, fontSize: 20, lineHeight: 22 }),
};

export function Text({ variant = 'body', color, style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <RNText
      style={[{ color: color ?? t.color.foreground, includeFontPadding: false }, VARIANT[variant](t.font), style]}
      {...rest}
    />
  );
}

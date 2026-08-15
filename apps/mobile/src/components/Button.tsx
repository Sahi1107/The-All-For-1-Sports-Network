import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  fullWidth?: boolean;
}

const SIZES: Record<Size, { h: number; px: number; text: number; icon: number }> = {
  sm: { h: 38, px: 16, text: 14, icon: 16 },
  md: { h: 48, px: 22, text: 15, icon: 18 },
  lg: { h: 56, px: 26, text: 17, icon: 20 },
};

// The volt pill — the platform's primary action. Pressing dims + settles slightly;
// a loading action swaps its label for a spinner in place (never a layout jump) and
// blocks re-taps. Disabled is a real state, not just a colour.
export function Button({
  label, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, icon: Icon, fullWidth, ...rest
}: ButtonProps) {
  const t = useTheme();
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  const bg: Record<Variant, string> = {
    primary: t.color.primary,
    secondary: t.color.elevated,
    ghost: 'transparent',
  };
  const fg: Record<Variant, string> = {
    primary: t.color['on-primary'],
    secondary: t.color.foreground,
    ghost: t.color.foreground,
  };
  const border: Record<Variant, string> = {
    primary: t.color.primary,
    secondary: t.color.line,
    ghost: t.color.line,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: s.h,
          paddingHorizontal: s.px,
          borderRadius: t.radius.pill,
          backgroundColor: bg[variant],
          borderColor: border[variant],
          borderWidth: variant === 'primary' ? 0 : StyleSheet.hairlineWidth * 2,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} size="small" />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={s.icon} color={fg[variant]} strokeWidth={2.25} /> : null}
          <Text style={[styles.label, { color: fg[variant], fontFamily: t.font.sans.bold, fontSize: s.text }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { letterSpacing: 0.2, includeFontPadding: false },
});

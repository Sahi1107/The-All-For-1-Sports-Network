import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
}

// The raised surface every panel sits on — card background, hairline border, one
// consistent radius. Interactive when given onPress (dims on tap); otherwise a
// plain container.
export function Card({ children, onPress, padded = true, style, ...rest }: CardProps) {
  const t = useTheme();
  const base = [
    styles.card,
    {
      backgroundColor: t.color.card,
      borderColor: t.color.line,
      borderRadius: t.radius.lg,
      padding: padded ? t.space(4) : 0,
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base} {...rest}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});

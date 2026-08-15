import { ActivityIndicator, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

interface ScreenProps extends ViewProps {
  edges?: readonly Edge[];
  padded?: boolean;
}

// Every screen's ground: the surface background + safe-area insets in one place, so
// no screen re-implements it (or forgets an inset and paints under the notch).
export function Screen({ children, edges = ['top', 'bottom'], padded = false, style, ...rest }: ScreenProps) {
  const t = useTheme();
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: t.color.surface }]}>
      <View style={[styles.fill, padded && { paddingHorizontal: t.space(5) }, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

/** Centered spinner on the surface — the loading state for a whole screen. */
export function ScreenLoader() {
  const t = useTheme();
  return (
    <View style={[styles.fill, styles.center, { backgroundColor: t.color.surface }]}>
      <ActivityIndicator color={t.color.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});

import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionLoading?: boolean;
}

// The one component behind every non-content state — nothing-here, error, offline.
// A calm icon in a soft well, a clear title, an optional line of why, and (only
// when there's a real next step) a single action. Never a blank screen, never a
// raw error string.
export function EmptyState({ icon: Icon, title, message, actionLabel, onAction, actionLoading }: EmptyStateProps) {
  const t = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View
        style={[
          styles.well,
          { backgroundColor: t.color.elevated, borderColor: t.color.line, borderRadius: t.radius.xl },
        ]}
      >
        <Icon size={26} color={t.color['ink-400']} strokeWidth={1.75} />
      </View>
      <Text style={[styles.title, { color: t.color.foreground, fontFamily: t.font.display.bold }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: t.color['ink-400'], fontFamily: t.font.sans.regular }]}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" loading={actionLoading} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48, gap: 4 },
  well: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  title: { fontSize: 17, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 4, maxWidth: 300 },
  action: { marginTop: 16 },
});

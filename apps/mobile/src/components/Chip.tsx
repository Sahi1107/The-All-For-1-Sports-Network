import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Tone = 'neutral' | 'volt' | 'muted';

interface ChipProps {
  label: string;
  tone?: Tone;
}

// Small, dense metadata pill — a sport, a role, a status. Not tappable by design
// (it labels, it doesn't act). `volt` is for the one attribute worth emphasising.
export function Chip({ label, tone = 'neutral' }: ChipProps) {
  const t = useTheme();

  const bg: Record<Tone, string> = {
    neutral: t.color.elevated,
    volt: t.color.primary + '26', // ~15% volt wash
    muted: 'transparent',
  };
  const fg: Record<Tone, string> = {
    neutral: t.color.foreground,
    volt: t.color['primary-light'],
    muted: t.color['ink-400'],
  };
  const border: Record<Tone, string> = {
    neutral: t.color.line,
    volt: t.color.primary + '40',
    muted: t.color.line,
  };

  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: bg[tone], borderColor: border[tone], borderRadius: t.radius.pill },
      ]}
    >
      <Text style={{ fontFamily: t.font.sans.semibold, fontSize: 12, color: fg[tone], includeFontPadding: false }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
});

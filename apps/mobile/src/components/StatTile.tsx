import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface StatTileProps {
  value: string | number;
  label: string;
  sub?: string;
  accent?: boolean;
}

// A single glanceable number. Saira numerals so digits line up, Inter label beneath.
// `accent` paints the number volt for the one figure that matters most in a group.
export function StatTile({ value, label, sub, accent }: StatTileProps) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: t.color.elevated, borderColor: t.color.line, borderRadius: t.radius.md },
      ]}
    >
      <Text
        style={{
          fontFamily: t.font.numeric.bold,
          fontSize: 28,
          lineHeight: 30,
          color: accent ? t.color['primary-light'] : t.color.foreground,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={{ fontFamily: t.font.sans.medium, fontSize: 12.5, color: t.color['ink-400'], marginTop: 4 }}>
        {label}
      </Text>
      {sub ? (
        <Text style={{ fontFamily: t.font.sans.regular, fontSize: 11, color: t.color['gray-custom'], marginTop: 1 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12, minWidth: 0 },
});

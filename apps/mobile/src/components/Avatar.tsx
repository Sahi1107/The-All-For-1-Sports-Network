import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';

type Variant = 'person' | 'crest';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  variant?: Variant;
}

// Deterministic duotone gradients — a name always hashes to the same pair, so a
// person looks identical across feed, profile and messages. People are circles,
// teams/tournaments are squircles (crests). A photo/logo, when present, takes the
// same shape + ring. Mirrors the web identity marks.
const PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#6366f1', '#4338ca'], // indigo
  ['#0ea5e9', '#0369a1'], // sky
  ['#10b981', '#047857'], // emerald
  ['#f59e0b', '#b45309'], // amber
  ['#ef4444', '#b91c1c'], // red
  ['#ec4899', '#be185d'], // pink
  ['#8b5cf6', '#6d28d9'], // violet
  ['#14b8a6', '#0f766e'], // teal
];

function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, src, size = 40, variant = 'person' }: AvatarProps) {
  const t = useTheme();
  const br = variant === 'crest' ? size * 0.28 : size / 2;
  const ring = { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: t.color.ink + '26' }; // ~15% ink
  const shape = { width: size, height: size, borderRadius: br };

  if (src) {
    return <Image source={{ uri: src }} style={[shape, ring]} accessibilityLabel={name} />;
  }

  const [from, to] = PALETTE[hash(name) % PALETTE.length];
  return (
    <LinearGradient
      colors={[from, to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[shape, ring, styles.center]}
    >
      <Text
        style={{
          fontFamily: t.font.display.bold,
          fontSize: size * 0.4,
          color: '#ffffff',
          includeFontPadding: false,
        }}
        allowFontScaling={false}
      >
        {initials(name)}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});

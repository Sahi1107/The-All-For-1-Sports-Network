import { View } from 'react-native';
import { BadgeCheck } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';

interface VerifiedBadgeProps {
  size?: number;
}

// The volt verified mark — earned by a real, stat-tracked athlete. One meaning,
// one colour; never decorative. Sized to sit inline beside a name.
export function VerifiedBadge({ size = 16 }: VerifiedBadgeProps) {
  const t = useTheme();
  return (
    <View accessibilityLabel="Verified" accessibilityRole="image">
      <BadgeCheck size={size} color={t.color.primary} strokeWidth={2.5} />
    </View>
  );
}

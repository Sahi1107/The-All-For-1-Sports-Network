import { Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { Calendar, Edit3, KeyRound, MapPin, MoreHorizontal, Ruler, Share2, Users } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { withAlpha } from '../../theme/tokens';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import type { Connection, ProfileUser } from '../../api/profile';

// Sport emoji + role-chip tone, matching the web hero exactly. Roles the platform
// actually uses (ATHLETE / COACH / SCOUT) map to their brand tokens; AGENT/ADMIN
// fall back to the neutral chip (the web's own default) rather than the off-palette
// amber/purple it tints them — see the note to you.
const SPORT_ICON: Record<string, string> = { BASKETBALL: '🏀', FOOTBALL: '⚽', CRICKET: '🏏' };
function roleChip(t: ReturnType<typeof useTheme>, role: string): { bg: string; fg: string } {
  switch (role) {
    case 'ATHLETE': return { bg: withAlpha(t.color.primary, 0.2), fg: t.color['primary-light'] };
    case 'COACH': return { bg: withAlpha(t.color.secondary, 0.2), fg: t.color.secondary };
    case 'SCOUT': return { bg: withAlpha(t.color.accent, 0.2), fg: t.color.accent };
    default: return { bg: t.color.elevated, fg: t.color['gray-custom'] };
  }
}
const metaTextStyle = (t: ReturnType<typeof useTheme>): TextStyle => ({ fontFamily: t.font.sans.regular, fontSize: 14, color: withAlpha(t.color.foreground, 0.7) });

function CountStat({ count, label }: { count: number; label: string }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ fontFamily: t.font.sans.bold, fontVariant: ['tabular-nums'], fontSize: 14, color: t.color.foreground }}>{count}</Text>
      <Text style={{ fontFamily: t.font.sans.regular, fontSize: 14, color: withAlpha(t.color.foreground, 0.7), marginLeft: 4 }}>{label}</Text>
    </View>
  );
}

// Secondary action button, matching the web hero's rounded-lg / bg-elevated shape
// (distinct from the volt pill CTA — this is the quieter action idiom).
function Action({ icon: Icon, label, onPress, iconOnly }: { icon: typeof Share2; label?: string; onPress?: () => void; iconOnly?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: t.color.elevated, borderColor: t.color.line, borderRadius: t.radius.md, opacity: pressed ? 0.85 : 1, paddingHorizontal: iconOnly ? 0 : 16, width: iconOnly ? 38 : undefined },
      ]}
    >
      <Icon size={14} color={t.color.foreground} strokeWidth={2.25} />
      {label ? <Text style={{ fontFamily: t.font.sans.medium, fontSize: 14, color: t.color.foreground }}>{label}</Text> : null}
    </Pressable>
  );
}

export function ProfileHero({ profile, isOwnProfile, isFollowing, connection, onShare, onEdit, onFollow, onConnect }: {
  profile: ProfileUser;
  isOwnProfile: boolean;
  isFollowing: boolean;
  connection: Connection | null;
  onShare?: () => void;
  onEdit?: () => void;
  onFollow?: () => void;
  onConnect?: () => void;
}) {
  const t = useTheme();
  const rc = roleChip(t, profile.role);
  const followLabel = isFollowing ? 'Following' : 'Follow';
  const connectLabel = connection?.status === 'ACCEPTED' ? 'Connected' : connection?.status === 'PENDING' ? 'Pending' : 'Connect';

  return (
    <Card padded={false} style={{ padding: 24 }}>
      <View style={styles.top}>
        <Avatar name={profile.name} src={profile.avatar} size={96} />

        <View style={styles.info}>
          {/* Name + verified */}
          <View style={[styles.row, { alignItems: 'center', gap: 8, flexWrap: 'wrap' }]}>
            <Text style={{ fontFamily: t.font.sans.bold, fontSize: 24, color: t.color.foreground }} numberOfLines={2}>{profile.name}</Text>
            {profile.verified ? <VerifiedBadge size={18} /> : null}
          </View>

          {/* Chips: role · sport · gender · position · managed · unclaimed */}
          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: rc.bg }]}>
              <Text style={{ fontFamily: t.font.sans.medium, fontSize: 12, color: rc.fg }}>{profile.role}</Text>
            </View>
            {profile.role !== 'ADMIN' && profile.sport ? (
              <Text style={{ fontFamily: t.font.sans.regular, fontSize: 14, color: withAlpha(t.color.foreground, 0.8) }}>
                {SPORT_ICON[profile.sport] ? `${SPORT_ICON[profile.sport]} ` : ''}{profile.sport}
              </Text>
            ) : null}
            {profile.role === 'ATHLETE' && profile.gender ? (
              <View style={[styles.chip, { backgroundColor: withAlpha(t.color.primary, 0.15) }]}>
                <Text style={{ fontFamily: t.font.sans.medium, fontSize: 12, color: t.color['primary-light'] }}>{profile.gender === 'FEMALE' ? "Women's" : "Men's"}</Text>
              </View>
            ) : null}
            {profile.position && profile.role !== 'ADMIN' ? (
              <Text style={{ fontFamily: t.font.sans.regular, fontSize: 14, color: withAlpha(t.color.foreground, 0.7) }}>· {profile.position}</Text>
            ) : null}
            {profile.guardianManaged ? (
              <View style={[styles.chip, styles.row, { backgroundColor: withAlpha(t.color.primary, 0.1), alignItems: 'center', gap: 4 }]}>
                <Users size={11} color={t.color['primary-light']} strokeWidth={2.25} />
                <Text style={{ fontFamily: t.font.sans.medium, fontSize: 12, color: t.color['primary-light'] }}>Parent / academy managed</Text>
              </View>
            ) : null}
            {profile.claimStatus === 'UNCLAIMED' ? (
              <View style={[styles.chip, styles.row, { backgroundColor: withAlpha(t.color.secondary, 0.15), alignItems: 'center', gap: 4 }]}>
                <KeyRound size={11} color={t.color['secondary-light']} strokeWidth={2.25} />
                <Text style={{ fontFamily: t.font.sans.medium, fontSize: 12, color: t.color['secondary-light'] }}>Unclaimed</Text>
              </View>
            ) : null}
          </View>

          {/* Meta: location · age · height */}
          {(profile.location || profile.age || profile.height) ? (
            <View style={styles.meta}>
              {profile.location ? <View style={[styles.row, styles.metaItem]}><MapPin size={13} color={withAlpha(t.color.foreground, 0.7)} strokeWidth={2} /><Text style={metaTextStyle(t)}>{profile.location}</Text></View> : null}
              {profile.age ? <View style={[styles.row, styles.metaItem]}><Calendar size={13} color={withAlpha(t.color.foreground, 0.7)} strokeWidth={2} /><Text style={metaTextStyle(t)}>{profile.age} yrs</Text></View> : null}
              {profile.height ? <View style={[styles.row, styles.metaItem]}><Ruler size={13} color={withAlpha(t.color.foreground, 0.7)} strokeWidth={2} /><Text style={metaTextStyle(t)}>{profile.height}</Text></View> : null}
            </View>
          ) : null}

          {/* Social stats */}
          <View style={styles.stats}>
            <CountStat count={profile._count?.followers ?? 0} label="Followers" />
            <CountStat count={profile._count?.following ?? 0} label="Following" />
            <CountStat count={profile._count?.connections ?? 0} label="Connections" />
            <CountStat count={profile._count?.highlights ?? 0} label="Highlights" />
          </View>

          {/* Bio */}
          {profile.bio ? (
            <Text style={{ fontFamily: t.font.sans.regular, fontSize: 14, lineHeight: 21, color: withAlpha(t.color.foreground, 0.75), marginTop: 16 }}>{profile.bio}</Text>
          ) : null}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Action icon={Share2} label="Share" onPress={onShare} />
        {isOwnProfile ? (
          <Action icon={Edit3} label="Edit Profile" onPress={onEdit} />
        ) : (
          <>
            <Pressable
              onPress={onFollow}
              style={({ pressed }) => [styles.action, { backgroundColor: isFollowing ? t.color.elevated : t.color.primary, borderColor: isFollowing ? t.color.line : t.color.primary, borderRadius: t.radius.md, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={{ fontFamily: t.font.sans.bold, fontSize: 14, color: isFollowing ? t.color.foreground : t.color['on-primary'] }}>{followLabel}</Text>
            </Pressable>
            <Action icon={Users} label={connectLabel} onPress={onConnect} />
            <Action icon={MoreHorizontal} iconOnly />
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  // Matches the web's MOBILE hero (flex-col): the avatar sits on top, the info
  // flows full-width beneath — not the desktop side-by-side, which cramps a phone.
  top: { gap: 16, alignItems: 'flex-start' },
  info: { alignSelf: 'stretch' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  metaItem: { alignItems: 'center', gap: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 8, marginTop: 16 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20, flexWrap: 'wrap' },
  action: { height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
});

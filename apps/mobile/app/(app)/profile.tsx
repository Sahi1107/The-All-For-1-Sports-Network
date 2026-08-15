import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LogOut, MapPin } from 'lucide-react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { fetchMe, type Profile } from '../../src/api/me';
import { Screen } from '../../src/components/Screen';
import { Avatar, Button, Card, Chip, StatTile, Text, VerifiedBadge } from '../../src/components';
import { useTheme } from '../../src/theme/ThemeProvider';

const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');
const joined = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

// The profile shell — the deliverable. Renders the signed-in user's real /auth/me
// data. Pull-to-refresh re-fetches; a failed refresh keeps the last-good data and
// says so inline rather than blanking the screen.
export default function ProfileScreen() {
  const t = useTheme();
  const { profile: seed, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(seed);
  const [refreshing, setRefreshing] = useState(false);
  const [staleNotice, setStaleNotice] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setProfile(await fetchMe());
      setStaleNotice(false);
    } catch {
      setStaleNotice(true); // keep showing what we have
    } finally {
      setRefreshing(false);
    }
  }, []);

  const p = profile;
  if (!p) return null; // unreachable at status 'authenticated'; guarded for types

  const isAthlete = p.role === 'ATHLETE';
  const stats: { value: string; label: string; accent?: boolean }[] = [
    { value: cap(p.sport) || '—', label: 'Sport', accent: true },
    isAthlete && p.position ? { value: p.position, label: 'Position' } : { value: cap(p.role), label: 'Role' },
    { value: joined(p.createdAt), label: 'Joined' },
  ];

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.color.primary} />
        }
      >
        <Text variant="label" color={t.color['ink-400']} style={styles.eyebrow}>MY PROFILE</Text>

        {/* Identity */}
        <View style={styles.header}>
          <Avatar name={p.name} src={p.avatar} size={72} />
          <View style={styles.identity}>
            <View style={styles.nameRow}>
              <Text variant="title" style={{ fontSize: 22 }} numberOfLines={1}>{p.name}</Text>
              {p.verified ? <VerifiedBadge size={18} /> : null}
            </View>
            <View style={styles.chips}>
              {p.role ? <Chip label={cap(p.role)} /> : null}
              {p.sport ? <Chip label={cap(p.sport)} tone="volt" /> : null}
            </View>
          </View>
        </View>

        {p.location ? (
          <View style={styles.metaRow}>
            <MapPin size={14} color={t.color['ink-400']} strokeWidth={2} />
            <Text variant="body" color={t.color['ink-400']} style={{ fontSize: 13.5 }}>{p.location}</Text>
          </View>
        ) : null}

        {staleNotice ? (
          <Text variant="label" color={t.color['secondary-light']} style={styles.stale}>
            Showing your last saved profile — couldn't refresh just now.
          </Text>
        ) : null}

        {/* Stats */}
        <View style={styles.stats}>
          {stats.map((s, i) => (
            <StatTile key={i} value={s.value} label={s.label} accent={s.accent} />
          ))}
        </View>

        {/* Bio */}
        {p.bio ? (
          <Card style={styles.section}>
            <Text variant="label" color={t.color['ink-400']} style={styles.cardLabel}>ABOUT</Text>
            <Text variant="body">{p.bio}</Text>
          </Card>
        ) : null}

        {/* Achievements */}
        {p.achievements ? (
          <Card style={styles.section}>
            <Text variant="label" color={t.color['ink-400']} style={styles.cardLabel}>ACHIEVEMENTS</Text>
            <Text variant="body">{p.achievements}</Text>
          </Card>
        ) : null}

        <View style={styles.signOut}>
          <Button label="Sign out" onPress={signOut} variant="ghost" size="md" icon={LogOut} fullWidth />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  eyebrow: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identity: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  stale: { marginTop: 12 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 20 },
  section: { marginTop: 16 },
  cardLabel: { marginBottom: 8 },
  signOut: { marginTop: 28 },
});

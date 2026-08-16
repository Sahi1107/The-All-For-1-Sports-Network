import { useCallback } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, SearchX, WifiOff } from 'lucide-react-native';
import { Screen, ScreenLoader } from '../../components/Screen';
import { EmptyState } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { fetchProfile } from '../../api/profile';
import { ProfileHero } from './ProfileHero';
import { PerformanceCard } from '../../components/PerformanceCard';

function statusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

// The read-first profile — my own and other people's, same view. Loads
// GET /users/:id and lays out the hero + (for athletes) the Performance Card.
// Every non-content state is explicit: loading, offline, not-found, error.
export function ProfileView({ id, isOwnProfile }: { id: string; isOwnProfile: boolean }) {
  const t = useTheme();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => fetchProfile(id),
    enabled: !!id,
  });

  const onShare = useCallback(() => {
    if (!data?.user) return;
    Share.share({ message: data.user.name, url: `https://allfor1.pro/s/athlete/${id}` }).catch(() => {});
  }, [data?.user, id]);

  if (isLoading) return <ScreenLoader />;

  if (isError) {
    const status = statusOf(error);
    if (status === 404) {
      return <Screen><EmptyState icon={SearchX} title="Profile not found" message="This profile may have been removed, or the link is out of date." /></Screen>;
    }
    const offline = status === undefined;
    return (
      <Screen>
        <EmptyState
          icon={offline ? WifiOff : AlertCircle}
          title={offline ? "You're offline" : "Couldn't load this profile"}
          message={offline ? 'Check your connection and try again.' : 'Something went wrong on our end. Please try again.'}
          actionLabel="Try again"
          onAction={() => refetch()}
          actionLoading={isRefetching}
        />
      </Screen>
    );
  }

  if (!data?.user) return <Screen><EmptyState icon={SearchX} title="Profile not found" /></Screen>;
  const p = data.user;

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={t.color.primary} />}
      >
        <ProfileHero
          profile={p}
          isOwnProfile={isOwnProfile}
          isFollowing={data.isFollowing}
          connection={data.connection}
          onShare={onShare}
        />
        {p.role === 'ATHLETE' ? (
          <View style={{ marginTop: 16 }}>
            <PerformanceCard id={p.id} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});

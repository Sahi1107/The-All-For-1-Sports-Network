import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../src/auth/AuthProvider';
import { ProfileView } from '../../../src/features/profile/ProfileView';

// Another person's profile — the deep-link target (allfor1://u/:id). Same
// ProfileView; isOwnProfile is true only if the id happens to be mine.
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  return <ProfileView id={id} isOwnProfile={profile?.id === id} />;
}

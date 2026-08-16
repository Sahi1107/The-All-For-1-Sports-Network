import { useAuth } from '../../src/auth/AuthProvider';
import { ScreenLoader } from '../../src/components/Screen';
import { ProfileView } from '../../src/features/profile/ProfileView';

// My profile — the same read-first view as anyone else's, fetched by my own id so
// it carries the full payload (_count, teams, rankings) the lightweight /auth/me
// bootstrap doesn't. isOwnProfile flips the hero actions to Share + Edit.
export default function MyProfileScreen() {
  const { profile } = useAuth();
  if (!profile) return <ScreenLoader />; // unreachable at status 'authenticated'
  return <ProfileView id={profile.id} isOwnProfile />;
}

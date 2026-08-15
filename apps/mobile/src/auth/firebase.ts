import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import { saveToken, clearToken } from './secureToken';

// The native Firebase Auth handle. @react-native-firebase reads the app config
// from the native google-services.json / GoogleService-Info.plist at build time —
// there is no JS API key here. This is the SAME Firebase project as the web app,
// so a user's identity (Firebase UID) is shared across web and mobile.

export type FirebaseUser = FirebaseAuthTypes.User;

export const firebaseAuth = auth();

/** Current user's fresh ID token (force-refresh optional), cached to secure store
 *  for cold-start attach. Returns null when signed out. */
export async function currentIdToken(forceRefresh = false): Promise<string | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  const token = await user.getIdToken(forceRefresh);
  await saveToken(token);
  return token;
}

/** Sign out of Firebase and drop the cached token. */
export async function signOutFirebase(): Promise<void> {
  await clearToken();
  await firebaseAuth.signOut();
}

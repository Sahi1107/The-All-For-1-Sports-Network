import { GoogleSignin, statusCodes, isErrorWithCode } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import Constants from 'expo-constants';

// Native Google sign-in → a Firebase credential. Unlike the web (popup), native
// uses the Google SDK to get an ID token, which we exchange for a Firebase
// credential so the resulting Firebase user is the SAME identity as on web.

let configured = false;

/** Configure once with the OAuth *web* client id from Firebase (not the iOS/Android
 *  client id — Firebase verifies the web client's audience). From app config. */
export function configureGoogle(): void {
  if (configured) return;
  const webClientId = (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)?.googleWebClientId;
  GoogleSignin.configure({ webClientId: webClientId ?? '' });
  configured = true;
}

export class SignInCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'SignInCancelled';
  }
}

export async function signInWithGoogle(): Promise<void> {
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    // @react-native-google-signin v13: { type: 'success', data: { idToken } }
    const idToken = response.data?.idToken;
    if (!idToken) throw new Error('Google sign-in returned no ID token');
    const credential = auth.GoogleAuthProvider.credential(idToken);
    await auth().signInWithCredential(credential);
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new SignInCancelled();
    }
    throw err;
  }
}

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import auth from '@react-native-firebase/auth';
import { SignInCancelled } from './google';

// Sign in with Apple → a Firebase credential. Required by App Store rule 4.8
// because we offer Google. iOS-only (the button is hidden elsewhere).
//
// Two correctness points that matter specifically here:
//  • Nonce: we send Apple a SHA-256 hash and Firebase the raw value, so a stolen
//    identity token can't be replayed.
//  • Name: Apple returns the real name ONLY on the first authorization. We persist
//    it to the Firebase profile immediately, or it's gone forever (and the private
//    relay email means we can't recover it another way).

export async function isAppleAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<void> {
  const rawNonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SignInCancelled();
    throw err;
  }

  const { identityToken, fullName } = credential;
  if (!identityToken) throw new Error('Apple sign-in returned no identity token');

  const appleCredential = auth.AppleAuthProvider.credential(identityToken, rawNonce);
  const result = await auth().signInWithCredential(appleCredential);

  // First-authorization-only name → persist before it's lost.
  const displayName = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ').trim();
  if (displayName && !result.user.displayName) {
    await result.user.updateProfile({ displayName });
    await result.user.getIdToken(true); // so the server sees the name on provider-signin
  }
}

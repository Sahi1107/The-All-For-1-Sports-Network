import * as SecureStore from 'expo-secure-store';

// A secure cache of the last-known Firebase ID token, in the platform keychain/
// keystore via expo-secure-store. @react-native-firebase already persists the
// session natively, but the token itself isn't synchronously available on a cold
// start until the SDK rehydrates. Caching it here lets the very first API call
// attach a bearer immediately; a live `getIdToken()` always supersedes it once the
// user object is available. Never stored anywhere but secure storage.

const KEY = 'af1.idToken';

export async function saveToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    /* non-fatal: the live SDK token remains the source of truth */
  }
}

export async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* ignore */
  }
}

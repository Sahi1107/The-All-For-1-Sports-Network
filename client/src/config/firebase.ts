import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  initializeAuth,
} from 'firebase/auth';

// These values are safe to expose in frontend code — they identify your
// Firebase project but cannot be used to access data without Auth rules.
// Set them in client/.env (VITE_ prefix makes them available in the browser).
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Instagram/Facebook in-app WebViews on iOS partition storage aggressively —
// Firebase's default IndexedDB persistence throws on init and crashes the app.
// Providing an ordered fallback (local → session → memory) lets Firebase pick
// whichever works; in the worst case auth just doesn't survive a reload,
// which is fine for an embedded browser session.
export const auth = initializeAuth(app, {
  persistence: [
    browserLocalPersistence,
    browserSessionPersistence,
    inMemoryPersistence,
  ],
});

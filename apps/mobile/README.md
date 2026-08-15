# mobile

The All For 1 native app — **Expo (React Native) + expo-router + TypeScript**, on
the shared `@af1/*` packages. Native UI, not the web components; `apps/web` keeps
its Capacitor shell separately.

## What's built (Phase 0)

- **Auth** — `@react-native-firebase/auth` on the **same Firebase project** as web,
  so a user's Firebase UID is shared across web and mobile. Native **Google** sign-in
  and **Sign in with Apple** (iOS, App Store rule 4.8). Tokens cached in the
  keychain/keystore via `expo-secure-store`; the shared `@af1/api-client` attaches
  them and does the transient-401 retry identically to web.
- **Identity model** — Firebase UID is the account key, never email. Apple private-
  relay addresses are treated as contact-only, never a dedup key; cross-provider
  dedup is by explicit link (the server already returns `409
  ACCOUNT_EXISTS_DIFFERENT_CREDENTIAL` → the app shows a connect-your-account notice).
- **Theme** — reads `@af1/tokens` (`src/theme`), following the OS light/dark setting.
- **Fonts** — Archivo / Inter / Saira Semi Condensed, loaded behind the native splash.
- **Navigation** — Expo Router: a gated `index` routes by auth status →
  `(auth)/sign-in`, `(auth)/onboarding`, or `(app)/profile`.
- **Primitives** (`src/components`) — Button (volt pill), Card, StatTile, Avatar +
  crest, VerifiedBadge, Chip, EmptyState, themed Text, Screen.
- **Profile shell** (`app/(app)/profile.tsx`) — renders the signed-in user's real
  `GET /api/auth/me` data, with pull-to-refresh and a keep-last-good offline notice.

Every state is deliberate: loading (splash → spinner), empty/error/offline
(`EmptyState`), and per-button sign-in loading + silent cancel.

## Prerequisites — only you can do these (accounts + secrets)

**1. Firebase (same `allfor1-prod` project as web)**
- Console → Project settings → add an **iOS app** (bundle id `pro.allfor1.app`) and an
  **Android app** (package `pro.allfor1.app`).
- Download **`GoogleService-Info.plist`** (iOS) and **`google-services.json`** (Android)
  into `apps/mobile/`. (Referenced by `app.json`; they're git-ignored — do not commit.)
- Authentication → Sign-in method → enable **Google** and **Apple**.

**2. Google sign-in IDs → into `app.json`**
- `extra.googleWebClientId` = the **Web client** OAuth id (Firebase → Authentication →
  Google → Web SDK configuration). Not the iOS/Android client id.
- `plugins → @react-native-google-signin` `iosUrlScheme` = the **reversed iOS client
  id** from `GoogleService-Info.plist` (`REVERSED_CLIENT_ID`).

**3. Sign in with Apple**
- Apple Developer → Identifiers → your App ID → enable **Sign in with Apple**.
- Create a **Services ID** + **Sign in with Apple key**, and register them in Firebase
  (Authentication → Apple).
- **Register your email sending domain** with Apple (Sign in with Apple → email
  communication) — otherwise private-relay users receive **no** verification/notification
  emails. This is the operational catch called out in the identity pitch.

## Build & run (native dev client — `@react-native-firebase` can't run in Expo Go)

From the **repo root**:
```bash
npm install
```
Then:
```bash
cd apps/mobile
npx expo prebuild            # generates ios/ + android/ from app.json (git-ignored)
npx expo run:ios             # or: npx expo run:android   (device or simulator/emulator)
```
`npm run typecheck` runs `tsc --noEmit`. Metro resolves `@af1/*` from source, so no
package prebuild is needed.

> iOS uses `useFrameworks: static` (required by `@react-native-firebase`) — a clean
> `pod install` happens inside `prebuild`. If CocoaPods caches bite, `cd ios && pod
> install --repo-update`.

## Verify the deliverable

1. App **boots** on iOS and Android (splash → sign-in in the bundled fonts).
2. **Sign in** with Google; on iOS, with Apple.
3. The **profile shell** renders your real name, role, sport, verified badge, location
   and “joined”, pulled live from `/api/auth/me`. Pull-to-refresh re-fetches.

The live API is already on the merged build (`/api/version` → `28486f2…`), so a valid
Firebase token is the only thing between sign-in and real data.

## Deliberately held (not shipped rough)

- **Native onboarding wizard** — new-user profile creation. Signing in works; a new
  account currently lands on an honest holding screen. Existing accounts (e.g. yours)
  go straight to the profile.
- **Tab bar** — deferred until there's a second real destination; a one-tab bar or
  empty placeholder tabs would read as unfinished. The Expo Router structure is in place.
- **Auto re-auth link flow** — the 409 conflict is detected and explained; the one-tap
  “sign in with your original method to link” UX is a fast-follow.
- **Server relay-dedup** — excluding `@privaterelay.appleid.com` emails from the
  server's orphan-match + flagging `emailIsPrivateRelay`. A focused, deliberate prod
  change to land **before** the app reaches real users (no risk until Apple sign-in
  ships to users). Tracked separately from this client build.

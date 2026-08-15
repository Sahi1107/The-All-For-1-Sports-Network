# Mobile setup runbook

From nothing to "app boots, I sign in, my profile renders." Follow top to bottom —
later steps consume values from earlier ones.

**The one rule that breaks everything if you get it wrong:** every Firebase config
file and client ID below must come from the **same Firebase project the API uses
(`allfor1-prod`)**. The API verifies each ID token's audience against that project;
a token minted by any other project makes **every** authenticated call return 401
(`Firebase ID token has incorrect "aud"`), even though sign-in itself "worked."

Order: **A** Firebase iOS app → **B** Firebase Android app → **C** Google →
**D** Apple → **E** fill `app.json` → **F** build → **G** verify.

Identifiers used throughout: iOS bundle id **`pro.allfor1.app`**, Android package
**`pro.allfor1.app`** (both already set in `app.json`).

---

## A. Add the iOS app to Firebase

1. [Firebase console](https://console.firebase.google.com) → open **allfor1-prod**
   (the same project the website uses — check the project name, don't create a new one).
2. Gear ⚙ → **Project settings** → **General** → scroll to **Your apps** → **Add app** → **Apple (iOS)**.
3. **Apple bundle ID** = `pro.allfor1.app` (exactly — this must equal `app.json`
   → `ios.bundleIdentifier`). Nickname optional. App Store ID: leave blank.
4. **Register app** → **Download `GoogleService-Info.plist`**.
5. Put it at **`apps/mobile/GoogleService-Info.plist`**. (It's git-ignored — never commit it.)
6. Skip the "Add Firebase SDK / init code" screens — the Expo config plugin wires that.

**Goes wrong when:** the bundle id in the plist ≠ the app's bundle id. RNFirebase
throws at launch — red screen `No matching client found for package name` / `FirebaseApp
failed to configure`. Fix: the plist's `BUNDLE_ID` must read `pro.allfor1.app`.

---

## B. Add the Android app to Firebase (+ SHA-1 — the #1 Android trap)

1. Same **Your apps** panel → **Add app** → **Android**.
2. **Android package name** = `pro.allfor1.app` (equals `app.json` → `android.package`).
3. **Register app** → **Download `google-services.json`** → put at **`apps/mobile/google-services.json`** (git-ignored).
4. **Add the debug SHA-1** (required for Google sign-in on Android). Get it:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore \
     -alias androiddebugkey -storepass android -keypass android | grep SHA1
   ```
   Copy the `SHA1:` value → Firebase → Project settings → your **Android app** →
   **Add fingerprint** → paste → Save. (Add your release/EAS SHA-1 too when you ship.)

**Goes wrong when:** no SHA-1 registered (or wrong keystore). Google sign-in on
Android throws **`DEVELOPER_ERROR` (status code 10)** — the account picker appears,
then sign-in fails with no token. This is the single most common Android failure.

---

## C. Google sign-in — enable it and copy two values

1. Firebase → **Authentication** → **Sign-in method** → **Google** → **Enable** → Save.
2. **`googleWebClientId`** — expand Google → **Web SDK configuration** → copy the **Web
   client ID** (ends `.apps.googleusercontent.com`). → paste into `app.json` →
   `extra.googleWebClientId`.
   - **Must be the _Web_ client ID**, not the iOS or Android one. Wrong one →
     picker works, then `auth/invalid-credential` (audience mismatch).
3. **`iosUrlScheme`** — open `apps/mobile/GoogleService-Info.plist`, find
   **`REVERSED_CLIENT_ID`** (looks like `com.googleusercontent.apps.1234-abcd`). → paste
   into `app.json` → the `@react-native-google-signin/google-signin` plugin's `iosUrlScheme`.
   - Wrong/missing → on iOS the Google sheet opens then returns to the app with no
     result (the callback URL isn't caught); sign-in appears to silently cancel.

---

## D. Sign in with Apple (needs a paid Apple Developer account)

**In [Apple Developer](https://developer.apple.com/account) → Certificates, Identifiers & Profiles:**

1. **Identifiers → App IDs** → find or create the App ID for **`pro.allfor1.app`**.
   Edit it → tick **Sign In with Apple** capability → Save.
   - Not enabled → native Apple sign-in throws at runtime (`ASAuthorizationError` /
     error 1000) and the entitlement is missing from the build.
2. **Identifiers → Services IDs** → **＋** → create one (e.g. identifier
   `pro.allfor1.app.web`, any description). Enable **Sign In with Apple** → **Configure**:
   - **Primary App ID** = `pro.allfor1.app`.
   - **Domains** = `allfor1-prod.firebaseapp.com`.
   - **Return URLs** = `https://allfor1-prod.firebaseapp.com/__/auth/handler`.
   - Save. (This lets Firebase verify Apple tokens.)
3. **Keys → ＋** → name it, tick **Sign In with Apple** → Configure → Primary App ID
   `pro.allfor1.app` → Continue → **Register** → **Download the `.p8` key** (one-time —
   you cannot re-download it). Note the **Key ID**.
4. Note your **Team ID** (top-right of the Apple Developer site).
5. **Configure email relay** (so "Hide My Email" users actually get email): Services ID
   → **Sign in with Apple for Email Communication** (or Services → Configure) → add your
   sending domain + email source. Skip this and every relay user silently receives **no**
   verification/notification email.

**Back in Firebase → Authentication → Sign-in method → Apple → Enable**, fill:
- **Services ID** = the one from D2.
- **Apple team ID** = from D4.
- **Key ID** = from D3.
- **Private key** = paste the contents of the `.p8` file.
- Save.

**Goes wrong when:** Apple provider left disabled in Firebase → `signInWithCredential`
returns **`auth/operation-not-allowed`**. Nonce not passed through → token rejected
(`invalid nonce`) — our code already sends the SHA-256 nonce to Apple and the raw one
to Firebase, so this only breaks if you change `src/auth/apple.ts`.

> Apple returns the user's real name **only on the very first authorization**. To
> re-test name capture: iPhone → Settings → your Apple ID → **Sign in with Apple** →
> the app → **Stop using Apple ID**, then sign in again.

---

## E. Fill the three placeholders in `apps/mobile/app.json`

| Placeholder in `app.json` | Value | From |
| --- | --- | --- |
| `extra.googleWebClientId` | Web client ID (`…apps.googleusercontent.com`) | C2 |
| plugin `@react-native-google-signin` → `iosUrlScheme` | `REVERSED_CLIENT_ID` | C3 |
| (Apple needs nothing in `app.json`) | — | `usesAppleSignIn: true` is already set |

The two config **files** (`GoogleService-Info.plist`, `google-services.json`) sit in
`apps/mobile/` and are referenced by `app.json` already.

---

## F. Build the dev client (`@react-native-firebase` cannot run in Expo Go)

From the **repo root**:
```bash
npm install
cd apps/mobile
npx expo prebuild --clean      # generates ios/ + android/ from app.json + plugins
npx expo run:ios               # Mac + Xcode; installs pods (static frameworks)
# and/or
npx expo run:android           # Android SDK + Java 17 + emulator/device
```

**Goes wrong when:**
- A config file is missing → `prebuild`/build error `File google-services.json is
  missing` or the iOS build can't find the plist. Re-check A5 / B3.
- iOS pods fail on Firebase + static frameworks → `cd ios && pod install --repo-update`,
  then re-run. (`useFrameworks: static` is already set — RNFirebase requires it.)
- `expo run:android` fails to find a device → start an emulator first, or plug in a
  phone with USB debugging.

---

## G. Verify the deliverable, and decode any failure

1. **Boots** on iOS + Android — splash → sign-in screen in Archivo/Inter (not the system font).
2. **Google** sign-in → account picker → returns → profile renders.
3. **Apple** sign-in (iOS) → Apple sheet → returns → profile renders.
4. **Profile shell** shows your real name, role, sport, verified badge, location, joined —
   from `GET /api/auth/me`. Pull down to refresh.

**Failure decoder:**

| Symptom | Cause | Fix |
| --- | --- | --- |
| Every API call 401s / bounced back to sign-in right after signing in | Mobile using a **different Firebase project** than the API, or the token has no custom claims yet | Config files must be from **allfor1-prod**; our bootstrap force-refreshes the token after `provider-signin` — if you changed that flow, restore it |
| Android Google: `DEVELOPER_ERROR` / code 10 | SHA-1 not registered, or `googleWebClientId` wrong | B4 (SHA-1) and C2 (Web client id) |
| iOS Google returns with no result | `iosUrlScheme` wrong/missing | C3 |
| `auth/invalid-credential` on Google | Used the iOS/Android client id instead of the **Web** one | C2 |
| `auth/operation-not-allowed` on Apple | Apple provider not enabled in Firebase | D (Firebase Apple config) |
| Apple name never saved | Expected — Apple only returns it on first authorization | "Stop using Apple ID", re-sign-in |
| Relay users get no email | Sending domain not registered with Apple | D5 |
| Red screen `No matching client…` at launch | Bundle id / package mismatch vs the config file | A3 / B2 |

Once G1–G4 pass, that's the Phase 0 deliverable. The **server relay-dedup** change is
held until then, by your call — no risk until Apple sign-in reaches real users.

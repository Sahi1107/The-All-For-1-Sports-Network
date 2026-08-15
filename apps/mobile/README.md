# mobile

The All For 1 native app — **Expo (React Native) + expo-router + TypeScript**.

This is a scaffold. It shares business logic with the web app through the
workspace packages and ships its own native UI (it does **not** reuse the web
React components — `apps/web` covers the Capacitor-wrapped web build separately).

## Shared packages

| Package            | Purpose                                                        |
| ------------------ | ------------------------------------------------------------- |
| `@af1/api-client`  | The axios instance + auth-recovery policy. `src/api/client.ts` wires the native seams (API origin, token source). |
| `@af1/core`        | Pure domain logic (ranking config, positions, message policy). |
| `@af1/validation`  | Zod request/response schemas.                                 |

## Layout

```
app/                 expo-router routes
  _layout.tsx        root stack + safe-area + status bar
  index.tsx          home screen — proves @af1/api-client reaches the API
src/
  api/client.ts      createApiClient() wired to the native seams
  auth/session.ts    the token seam (getToken / refreshToken / onSessionExpired)
  config/env.ts      API origin from app.json `extra.apiUrl` (or EXPO_PUBLIC_API_URL)
metro.config.js      monorepo-aware Metro (watches the workspace, pins node_modules)
```

## Setup & run

From the **repo root** (workspaces are hoisted there):

```bash
npm install
# Align Expo's native dependency versions to the installed SDK:
npx expo install --fix --workspace mobile
```

Then, from `apps/mobile`:

```bash
npm run start        # Expo dev server (press i / a for a simulator)
npm run ios          # iOS simulator
npm run android      # Android emulator
npm run typecheck    # tsc --noEmit
```

The `@af1/*` packages are consumed from their built `dist/`, so build them once
(or after changes): `npm run build --workspace=@af1/api-client` (and `core`,
`validation`). Metro also watches their source via `watchFolders`.

## Not done yet (scaffold boundaries)

- **Auth**: `src/auth/session.ts` holds an in-memory token and no-ops refresh.
  Wire it to the mobile auth provider (store the token in `expo-secure-store`,
  reset navigation to sign-in on `onSessionExpired`). Until then, unauthenticated
  requests (e.g. `GET /version`) work end-to-end — which the home screen proves.
- **UI**: `app/index.tsx` is a placeholder connectivity check, not real product UI.
- **Native builds**: no `ios/` / `android/` checked in (managed workflow); run
  `npx expo prebuild` or use EAS Build when you need native binaries.

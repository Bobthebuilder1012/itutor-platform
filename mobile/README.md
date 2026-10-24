# The iTutor mobile apps

Android and iOS ship as a **Capacitor shell around the deployed web app**. The
app loads `https://myitutor.com` directly, so a normal Vercel deploy reaches
app users the moment it goes live — no store release for a web change.

A store release is only needed when something in this directory, `android/`,
`ios/`, `capacitor.config.ts` or the native plugin list changes.

| | |
|---|---|
| Bundle / application ID | `com.myitutor.app` |
| Custom URL scheme | `com.myitutor.app://` |
| Min Android / iOS | SDK 24 (Android 7) · iOS 15 |
| Capacitor | 8.5.3 |

## What is actually native

Everything else is the website.

- **Push** — real FCM/APNs tokens, registered through the existing
  `/api/push-tokens/register` route with `platform: 'ios' | 'android'`.
  Web push is disabled inside the app so a device never registers twice.
- **Sign-in** — Google refuses to serve its sign-in pages to an embedded
  WebView, so OAuth opens in the system browser (Custom Tab /
  SFSafariViewController) and returns through `com.myitutor.app://auth/callback`.
  The app then hands the PKCE code to the existing `/auth/callback` route
  rather than exchanging it itself, so native sign-in goes through the same
  profile bootstrap and role-based redirect as the website.
- **Sign in with Apple** — shown on the iOS app's login pages only, because
  App Review guideline 4.8 requires it alongside Google.
- **Splash, status bar, Android back button, offline screen.**
- **Deep links** — `myitutor.com` links open in the app once the two files in
  `mobile/well-known/` are served (see below).

The web-side code is `lib/native/` (platform detection, OAuth hand-off) and
`components/native/` (the bridge, the Apple button). All of it no-ops in a
browser, so nothing here changes the website.

## Working on it

```bash
npm install
npx cap sync            # after any dependency or capacitor.config.ts change
npx cap open android    # Android Studio
npx cap open ios        # Xcode — macOS only
```

`npx cap sync` regenerates native plugin wiring and recopies `mobile/www`. Run
it after every `npm install`, or the native build will use a stale plugin list.

**Point the shell at a preview build** instead of production:

```bash
CAP_SERVER_URL=https://itutor-platform-env-staging-liam-rampersads-projects.vercel.app npx cap sync
```

Never commit a non-production `CAP_SERVER_URL` — it is read at sync time and
baked into `capacitor.config.json` inside the app bundle.

## Icons and splash screens

Sources live in `mobile/assets/` and were generated from `public/favicon.png`.
After changing one:

```bash
npx capacitor-assets generate --assetPath mobile/assets \
  --iconBackgroundColor '#ffffff' --iconBackgroundColorDark '#ffffff' \
  --splashBackgroundColor '#ffffff' --splashBackgroundColorDark '#0b0f14'
```

It also writes PWA icons into `public/assets/icons/`, which this project does
not use — delete them before committing.

## Before either store will take a build

- **Firebase config files are not in the repo.** Android needs
  `android/app/google-services.json`, iOS needs
  `ios/App/App/GoogleService-Info.plist`, both from the Firebase console for
  bundle ID `com.myitutor.app`. Without them the app runs fine but push is off.
- **Deep links need the association files served.** Copy
  `mobile/well-known/*` to `public/.well-known/`, fill in the Apple Team ID and
  the Play App Signing SHA-256, and deploy. Until then both link filters are
  inert — the app still works, links just open in the browser.
- **iOS** — follow `mobile/APPLE_SETUP.md` end to end. It covers the D-U-N-S
  number, the developer program, Sign in with Apple, APNs, and the review risks
  specific to iTutor (guideline 4.2 WebView wrappers, 3.1.3(d) and paid group
  classes, and parent accounts having no in-app delete).
- **Android** — create the Play listing under `com.myitutor.app`, enable Play
  App Signing, and build an `.aab` from Android Studio.

## Known gaps

- Nothing here has been run on a device yet; no build has been produced on
  either platform.
- `versionCode`/`versionName` (Android) and `CURRENT_PROJECT_VERSION`/
  `MARKETING_VERSION` (iOS) are at `1` / `1.0` and must be bumped per release.
- `aps-environment` in `ios/App/App/App.entitlements` is `development`.
- iOS is iPhone-only for v1 (`TARGETED_DEVICE_FAMILY = 1`).

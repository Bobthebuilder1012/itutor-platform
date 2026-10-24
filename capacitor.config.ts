import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iTutor ships as a thin native shell around the deployed web app.
 *
 * `server.url` means the app loads https://myitutor.com directly, so a Vercel
 * deploy reaches app users immediately — no store release for a web change.
 * `mobile/www` is only the fallback bundle: the offline screen Capacitor shows
 * when the device cannot reach the server.
 *
 * Point the shell at a preview build by exporting CAP_SERVER_URL before
 * `npx cap sync` (e.g. the staging alias). Never commit a non-production value.
 */
const serverUrl = process.env.CAP_SERVER_URL || 'https://myitutor.com';

const config: CapacitorConfig = {
  appId: 'com.myitutor.app',
  appName: 'iTutor',
  webDir: 'mobile/www',

  server: {
    url: serverUrl,
    // The site is HTTPS-only; refuse to load it over plain HTTP.
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    // Shown by the WebView when serverUrl is unreachable.
    errorPath: 'offline.html',
    /**
     * Hosts allowed to render INSIDE the WebView. Anything not listed opens in
     * the system browser instead.
     *
     * Checkout must stay in the WebView, otherwise the redirect back to
     * myitutor.com lands in a different browser and the session is lost.
     * Meet/Zoom are deliberately absent — they belong in their own apps.
     */
    allowNavigation: [
      'myitutor.com',
      '*.myitutor.com',
      'nfkrfciozjxrodkusrhh.supabase.co',
      'checkout.stripe.com',
      'js.stripe.com',
      'hooks.stripe.com',
      '*.wipayfinancial.com',
      'wipayfinancial.com',
    ],
  },

  ios: {
    // The web app paints its own background; stop the white flash on rotate.
    backgroundColor: '#ffffff',
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
  },

  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#ffffff',
      overlaysWebView: false,
    },
    // Tokens are registered through the existing /api/push-tokens/register
    // route by components/native/NativeAppBridge.tsx.
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

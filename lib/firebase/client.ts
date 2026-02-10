// Client-side only Firebase utilities
// This file should only be imported dynamically in client components

function getFirebaseConfig() {
  // Only run in browser
  if (typeof window === 'undefined') return null;

  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };

  // These are public values; fail gracefully if not configured.
  const missing = Object.entries(config)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) return null;
  return config as Required<typeof config>;
}

// Helper to dynamically load Firebase modules
async function loadFirebaseModule(moduleName: string): Promise<any> {
  try {
    // Use Function constructor to prevent webpack from analyzing the import
    const dynamicImport = new Function('moduleName', 'return import(moduleName)');
    return await dynamicImport(moduleName);
  } catch (error) {
    console.debug(`Failed to load ${moduleName}:`, error);
    return null;
  }
}

export async function getFirebaseApp(): Promise<any | null> {
  // Only run in browser
  if (typeof window === 'undefined') return null;

  const config = getFirebaseConfig();
  if (!config) return null;

  try {
    const firebaseApp = await loadFirebaseModule('firebase/app');
    if (!firebaseApp) return null;

    const existing = firebaseApp.getApps();
    if (existing.length > 0) return existing[0]!;

    return firebaseApp.initializeApp(config);
  } catch (error) {
    console.debug('Firebase app initialization failed:', error);
    return null;
  }
}

export async function getFirebaseMessaging(): Promise<any | null> {
  // Only run in browser
  if (typeof window === 'undefined') return null;

  const app = await getFirebaseApp();
  if (!app) return null;

  try {
    const firebaseMessaging = await loadFirebaseModule('firebase/messaging');
    if (!firebaseMessaging) return null;

    const supported = await firebaseMessaging.isSupported();
    if (!supported) return null;

    return firebaseMessaging.getMessaging(app);
  } catch (error) {
    console.debug('Firebase messaging initialization failed:', error);
    return null;
  }
}


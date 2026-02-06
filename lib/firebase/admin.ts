import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let firebaseAdminApp: App | null = null;

export function getFirebaseAdmin(): App | null {
  if (firebaseAdminApp) return firebaseAdminApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseAdminApp = existingApps[0]!;
    return firebaseAdminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('Firebase Admin credentials not configured');
    return null;
  }

  try {
    firebaseAdminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        // Handle escaped newlines in private key
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
    return firebaseAdminApp;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    return null;
  }
}

export function getFirebaseAdminMessaging() {
  const app = getFirebaseAdmin();
  if (!app) return null;
  return getMessaging(app);
}

export const runtime = 'edge';

function env(name: string) {
  return process.env[name] || '';
}

export async function GET() {
  // Public Firebase config (safe to expose)
  const firebaseConfig = {
    apiKey: env('NEXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: env('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: env('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    appId: env('NEXT_PUBLIC_FIREBASE_APP_ID'),
    messagingSenderId: env('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  };

  const hasConfig = Object.values(firebaseConfig).every(Boolean);

  const js = hasConfig
    ? `
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(firebaseConfig)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title;
  const body = payload?.notification?.body;
  if (!title || !body) return;
  const data = payload?.data || {};
  self.registration.showNotification(title, {
    body,
    data,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification?.close();
  const deepLink = event.notification?.data?.deep_link;
  if (deepLink) {
    event.waitUntil(clients.openWindow(deepLink));
  }
});
`
    : `
// Firebase Messaging SW not configured.
`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // Ensure updates propagate quickly
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}


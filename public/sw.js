// Service Worker for Push Notifications (Web Push API)
// Version: 1.1.0

const SW_VERSION = '1.1.0';
const CACHE_NAME = 'itutor-push-v1';

// Install event
self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] Installing service worker...`);
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activating service worker...`);
  event.waitUntil(
    // Claim all clients immediately
    self.clients.claim().then(() => {
      console.log(`[SW ${SW_VERSION}] Service worker activated and ready`);
    })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log(`[SW ${SW_VERSION}] Push received:`, event);
  
  try {
    const data = event.data?.json() ?? {};
    const title = data.title || 'iTutor Notification';
    const options = {
      body: data.body || 'You have a new notification',
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: data.data || {},
      tag: data.tag || 'default',
      requireInteraction: false,
      vibrate: [200, 100, 200], // Vibration pattern for mobile
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
        .then(() => console.log(`[SW ${SW_VERSION}] Notification shown`))
        .catch((err) => console.error(`[SW ${SW_VERSION}] Error showing notification:`, err))
    );
  } catch (error) {
    console.error(`[SW ${SW_VERSION}] Error processing push:`, error);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log(`[SW ${SW_VERSION}] Notification clicked:`, event);
  event.notification.close();

  const data = event.notification.data;
  let url = '/';

  // Determine URL based on notification data
  if (data?.deep_link) {
    url = data.deep_link;
  } else if (data?.session_id) {
    url = '/student/sessions';
  } else if (data?.url) {
    url = data.url;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          console.log(`[SW ${SW_VERSION}] Focusing existing window`);
          return client.focus().then(() => {
            // Navigate to the URL
            if (client.navigate) {
              return client.navigate(url);
            }
          });
        }
      }
      
      // Open new window if none exists
      if (self.clients.openWindow) {
        console.log(`[SW ${SW_VERSION}] Opening new window:`, url);
        return self.clients.openWindow(url);
      }
    })
  );
});

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log(`[SW ${SW_VERSION}] Push subscription changed`);
  // Handle subscription renewal if needed
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      // applicationServerKey would need to be passed here
    }).catch((err) => {
      console.error(`[SW ${SW_VERSION}] Error resubscribing:`, err);
    })
  );
});

// Optional: Handle fetch events for offline support (currently just pass through)
self.addEventListener('fetch', (event) => {
  // Pass through all requests (no caching for now)
  event.respondWith(fetch(event.request));
});

console.log(`[SW ${SW_VERSION}] Service worker loaded`);

// Service Worker for Push Notifications
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

// Handle push notifications
sw.addEventListener('push', (event: PushEvent) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'iTutor Notification';
  const options: NotificationOptions = {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: data.data || {},
    tag: data.tag || 'default',
    requireInteraction: false,
  };

  event.waitUntil(
    sw.registration.showNotification(title, options)
  );
});

// Handle notification clicks
sw.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const data = event.notification.data;
  let url = '/';

  // Determine URL based on notification data
  if (data?.deep_link) {
    url = data.deep_link;
  } else if (data?.session_id) {
    url = '/student/sessions'; // Default fallback
  }

  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url === new URL(url, sw.location.origin).href && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window if none exists
      if (sw.clients.openWindow) {
        return sw.clients.openWindow(url);
      }
    })
  );
});

// Install event
sw.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  sw.skipWaiting();
});

// Activate event
sw.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(sw.clients.claim());
});

export {};

// Firebase Cloud Messaging Service Worker
// This enables push notifications on iOS, Android, and Desktop
// Version: 1.0.0

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration will be loaded from environment
// This file needs to be in /public/ folder to be accessible at root level

console.log('[FCM SW] Firebase Cloud Messaging service worker loaded');

// Initialize Firebase when config is available
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    console.log('[FCM SW] Received Firebase config');
    
    try {
      firebase.initializeApp(event.data.config);
      const messaging = firebase.messaging();
      
      console.log('[FCM SW] Firebase initialized successfully');
      
      // Handle background messages
      messaging.onBackgroundMessage((payload) => {
        console.log('[FCM SW] Received background message:', payload);
        
        const notificationTitle = payload.notification?.title || 'iTutor Notification';
        const notificationOptions = {
          body: payload.notification?.body || '',
          icon: payload.notification?.icon || '/favicon.png',
          badge: '/favicon.png',
          data: payload.data || {},
          tag: payload.data?.tag || 'default',
          requireInteraction: false,
          vibrate: [200, 100, 200],
        };
        
        return self.registration.showNotification(notificationTitle, notificationOptions);
      });
    } catch (error) {
      console.error('[FCM SW] Error initializing Firebase:', error);
    }
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[FCM SW] Notification clicked:', event);
  event.notification.close();
  
  const data = event.notification.data;
  let url = '/';
  
  if (data?.deep_link) {
    url = data.deep_link;
  } else if (data?.url) {
    url = data.url;
  } else if (data?.session_id) {
    url = '/student/sessions';
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if found
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => {
            if (client.navigate) {
              return client.navigate(url);
            }
          });
        }
      }
      
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Install event
self.addEventListener('install', (event) => {
  console.log('[FCM SW] Service worker installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[FCM SW] Service worker activating...');
  event.waitUntil(clients.claim());
});

console.log('[FCM SW] Service worker ready and waiting for Firebase config');

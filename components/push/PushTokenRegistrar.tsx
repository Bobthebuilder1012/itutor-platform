'use client';

import { useEffect, useRef } from 'react';

const TOKEN_STORAGE_KEY = 'itutor_push_token_web_v1';

function canUseWebPush() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  );
}

export default function PushTokenRegistrar() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!canUseWebPush()) return;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.log('📱 Firebase VAPID key not configured - Firebase push disabled (using Web Push API instead)');
      return;
    }

    const run = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Register (or re-use) service worker required for background push.
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        // Use Function constructor to bypass webpack static analysis
        const loadModule = new Function('path', 'return import(path)');
        
        const firebaseClient = await loadModule('@/lib/firebase/client').catch(() => null);
        if (!firebaseClient) {
          console.log('📱 Firebase client not available - using Web Push API instead');
          return;
        }
        
        const messaging = await firebaseClient.getFirebaseMessaging();
        if (!messaging) return;

        const firebaseMessaging = await loadModule('firebase/messaging').catch(() => null);
        if (!firebaseMessaging) {
          console.log('📱 Firebase messaging not available - using Web Push API instead');
          return;
        }

        const fcmToken = await firebaseMessaging.getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swReg,
        });

        if (!fcmToken) return;

        const prev = window.localStorage.getItem(TOKEN_STORAGE_KEY);
        if (prev === fcmToken) {
          // Touch last_used_at server-side (best-effort).
          fetch('/api/push-tokens/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: fcmToken, platform: 'web' }),
          }).catch(() => {});
          return;
        }

        const res = await fetch('/api/push-tokens/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: fcmToken, platform: 'web' }),
        });

        if (!res.ok) return;

        window.localStorage.setItem(TOKEN_STORAGE_KEY, fcmToken);
      } catch (error) {
        // Fail silently (permission denied, unsupported, Firebase not configured, etc.)
        console.debug('📱 Firebase push registration skipped:', error);
      }
    };

    run();
  }, []);

  return null;
}


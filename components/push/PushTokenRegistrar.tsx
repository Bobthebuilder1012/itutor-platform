'use client';

import { useEffect, useRef } from 'react';
import { getToken } from 'firebase/messaging';
import { getFirebaseMessaging } from '@/lib/firebase/client';

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
    if (!vapidKey) return;

    const run = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Register (or re-use) service worker required for background push.
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        const messaging = await getFirebaseMessaging();
        if (!messaging) return;

        const fcmToken = await getToken(messaging, {
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
      } catch {
        // Fail silently (permission denied, unsupported, etc.)
      }
    };

    run();
  }, []);

  return null;
}


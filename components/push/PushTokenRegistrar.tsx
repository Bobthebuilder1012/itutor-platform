'use client';

import { useEffect, useRef } from 'react';

const TOKEN_STORAGE_KEY = 'itutor_push_token_web_v1';

function isPushEnabledForEnvironment() {
  const devOptIn = process.env.NEXT_PUBLIC_ENABLE_PUSH_IN_DEV === 'true';
  return process.env.NODE_ENV === 'production' || devOptIn;
}

function canUseWebPush() {
  return (
    isPushEnabledForEnvironment() &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  );
}

function getFirebaseConfig() {
  if (typeof window === 'undefined') return null;
  
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
  
  // Check if all required fields are present
  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) return null;
  
  return config;
}

export default function PushTokenRegistrar() {
  const ranRef = useRef(false);

  useEffect(() => {
    // In development, remove stale service workers unless push testing is explicitly enabled.
    if (
      typeof window !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      process.env.NEXT_PUBLIC_ENABLE_PUSH_IN_DEV !== 'true' &&
      'serviceWorker' in navigator
    ) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }

    if (ranRef.current) return;
    ranRef.current = true;

    if (!canUseWebPush()) return;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    const firebaseConfig = getFirebaseConfig();
    
    if (!vapidKey || !firebaseConfig) {
      console.debug('📱 Firebase not fully configured - using Web Push API fallback');
      console.debug('   Missing:', !vapidKey ? 'VAPID key' : 'Firebase config');
      console.debug('   iOS notifications will NOT work without Firebase');
      return;
    }

    const run = async () => {
      try {
        // Don't auto-request permission; only register when already granted
        if (Notification.permission !== 'granted') return;

        // Register service worker
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/'
        });
        
        console.log('📱 Firebase service worker registered');

        // Send Firebase config to service worker
        if (swReg.active) {
          swReg.active.postMessage({
            type: 'FIREBASE_CONFIG',
            config: firebaseConfig
          });
        }

        await navigator.serviceWorker.ready;

        // Dynamically load Firebase modules
        const loadModule = new Function('path', 'return import(path)');
        
        const firebaseClient = await loadModule('@/lib/firebase/client').catch((err: any) => {
          console.debug('📱 Firebase client load failed:', err);
          return null;
        });
        
        if (!firebaseClient) {
          console.debug('📱 Firebase client not available - ensure firebase package is installed');
          return;
        }
        
        const messaging = await firebaseClient.getFirebaseMessaging();
        if (!messaging) {
          console.debug('📱 Firebase messaging not initialized');
          return;
        }

        const firebaseMessaging = await loadModule('firebase/messaging').catch(() => null);
        if (!firebaseMessaging) {
          console.debug('📱 Firebase messaging module not available');
          return;
        }

        // Get FCM token
        const fcmToken = await firebaseMessaging.getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swReg,
        });

        if (!fcmToken) {
          console.debug('📱 Failed to get FCM token');
          return;
        }

        console.log('✅ FCM token obtained (iOS + Android + Desktop notifications enabled)');

        // Check if token already registered
        const prev = window.localStorage.getItem(TOKEN_STORAGE_KEY);
        if (prev === fcmToken) {
          // Token unchanged, just touch last_used_at
          fetch('/api/push-tokens/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: fcmToken, platform: 'web' }),
          }).catch(() => {});
          return;
        }

        // Register new token
        const res = await fetch('/api/push-tokens/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: fcmToken, platform: 'web' }),
        });

        if (!res.ok) {
          console.error('📱 Failed to register FCM token with backend');
          return;
        }

        // Save token to localStorage
        window.localStorage.setItem(TOKEN_STORAGE_KEY, fcmToken);
        console.log('✅ Push notifications registered successfully');
        
      } catch (error: any) {
        // Provide helpful error messages
        if (error.code === 'messaging/permission-blocked') {
          console.debug('📱 Notification permission blocked by user');
        } else if (error.code === 'messaging/failed-service-worker-registration') {
          console.error('📱 Service worker registration failed - check HTTPS and service worker file');
        } else if (error.code === 'messaging/unsupported-browser') {
          console.debug('📱 Push notifications not supported in this browser');
        } else {
          console.debug('📱 Firebase push registration skipped:', error.code || error.message);
        }
      }
    };

    run();
  }, []);

  return null;
}


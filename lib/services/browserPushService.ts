// =====================================================
// BROWSER PUSH NOTIFICATION SERVICE
// =====================================================
// Handles web push notifications for desktop browsers

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

// Debug: Log VAPID key status on module load
if (typeof window !== 'undefined') {
  console.log('🔑 VAPID Key loaded:', VAPID_PUBLIC_KEY ? '✅ Present' : '❌ Missing');
  if (!VAPID_PUBLIC_KEY) {
    console.error('VAPID public key not found in environment variables. Check NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env.local');
  }
}

/**
 * Convert VAPID public key to Uint8Array for subscription
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}

/**
 * Check if browser supports push notifications
 */
export function isPushNotificationSupported(): boolean {
  return process.env.NODE_ENV === 'production' &&
         typeof window !== 'undefined' && 
         'serviceWorker' in navigator && 
         'PushManager' in window;
}

/**
 * Check if user has granted notification permission
 */
export function hasNotificationPermission(): boolean {
  if (typeof window === 'undefined') return false;
  return Notification.permission === 'granted';
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    console.warn('Push notifications are not supported');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
}

/**
 * Register service worker and subscribe to push notifications
 */
export async function subscribeToPushNotifications(userId: string): Promise<PushSubscription | null> {
  if (!isPushNotificationSupported()) {
    console.debug('Push notifications not supported in this browser');
    return null;
  }

  if (!VAPID_PUBLIC_KEY) {
    console.debug('VAPID public key not configured - web push disabled');
    return null;
  }

  try {
    // Check if service worker is already registered
    let registration = await navigator.serviceWorker.getRegistration('/sw.js');
    
    if (!registration) {
      // Register service worker if not already registered
      registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('📱 Service worker registered successfully');
    }

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      console.log('✅ Already subscribed to push notifications');
      return existingSubscription;
    }

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    // Save subscription to database
    const response = await fetch('/api/push-notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        subscription: subscription.toJSON(),
        platform: 'web'
      })
    });

    if (!response.ok) {
      console.error('Failed to save push subscription to database');
      // Still return subscription even if DB save fails
    }

    console.log('✅ Subscribed to push notifications');
    return subscription;
  } catch (error: any) {
    // Provide more helpful error messages
    if (error.name === 'AbortError') {
      console.debug('⚠️ Push subscription aborted - this is normal if notifications are blocked or unavailable');
    } else if (error.name === 'NotAllowedError') {
      console.debug('⚠️ Notification permission denied by user');
    } else if (error.name === 'InvalidStateError') {
      console.debug('⚠️ Service worker in invalid state - try refreshing the page');
    } else {
      console.error('❌ Error subscribing to push notifications:', error.name, error.message);
    }
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(userId: string): Promise<boolean> {
  if (!isPushNotificationSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      
      // Remove from database
      await fetch('/api/push-notifications/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, platform: 'web' })
      });

      console.log('✅ Unsubscribed from push notifications');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error unsubscribing:', error);
    return false;
  }
}

/**
 * Check if user is currently subscribed
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushNotificationSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

/**
 * Initialize push notifications for logged-in user
 * Call this on app load
 */
export async function initializePushNotifications(userId: string): Promise<void> {
  // Silent initialization - don't show errors to user
  if (!isPushNotificationSupported()) return;
  if (!VAPID_PUBLIC_KEY) return; // Fail silently if not configured

  try {
    // Check if already subscribed
    const isSubscribed = await isPushSubscribed();
    
    if (!isSubscribed && hasNotificationPermission()) {
      // Auto-subscribe if permission already granted
      await subscribeToPushNotifications(userId);
    }
  } catch (error) {
    // Fail silently - push notifications are optional
    console.debug('Push notification initialization skipped:', error);
  }
}

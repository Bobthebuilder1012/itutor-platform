'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeApp, getNativePlatform } from '@/lib/native/platform';
import { resolveNativeAuthCallback } from '@/lib/native/oauth';

const TOKEN_STORAGE_KEY = 'itutor_push_token_native_v1';

/**
 * Everything the Capacitor shell needs that the web app does not: splash,
 * status bar, the Android back button, the OAuth/deep-link hand-off and native
 * FCM registration.
 *
 * Renders nothing and does nothing in a browser, so it is safe in the root
 * layout. Capacitor plugins are imported lazily so neither they nor Firebase
 * reach the web bundle.
 */
export default function NativeAppBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;

    const platform = getNativePlatform();
    const cleanups: Array<() => void> = [];
    let cancelled = false;

    const register = async (handle: Promise<{ remove: () => void }>) => {
      const listener = await handle;
      if (cancelled) listener.remove();
      else cleanups.push(() => listener.remove());
    };

    const run = async () => {
      const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
      ]);

      // The app is a light surface; keep the clock and battery dark on it.
      try {
        await StatusBar.setStyle({ style: Style.Light });
        if (platform === 'android') {
          await StatusBar.setBackgroundColor({ color: '#ffffff' });
        }
      } catch {
        // Not fatal — some Android skins reject the colour call.
      }

      // Hand off from the native splash once React has painted.
      try {
        await SplashScreen.hide();
      } catch {
        /* already hidden */
      }

      // Android's hardware/gesture back should walk the web history and only
      // leave the app at the first page, matching every other Android app.
      await register(
        App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack && window.history.length > 1) window.history.back();
          else App.exitApp();
        })
      );

      // OAuth returns, plus any myitutor.com link opened from outside the app.
      await register(
        App.addListener('appUrlOpen', async ({ url }) => {
          try {
            if (url.startsWith('com.myitutor.app://')) {
              const next = await resolveNativeAuthCallback(url);
              // A full navigation, not router.push: /auth/callback is a route
              // handler, which the client router cannot reach.
              if (next) window.location.assign(next);
              return;
            }
            if (url.startsWith('https://myitutor.com')) {
              const { pathname, search } = new URL(url);
              router.push(`${pathname}${search}`);
            }
          } catch (error) {
            console.error('[native] deep link failed', error);
          }
        })
      );

      await setUpPush(register, router, platform);
    };

    run().catch((error) => console.error('[native] bridge failed to start', error));

    return () => {
      cancelled = true;
      cleanups.forEach((remove) => remove());
    };
  }, [router]);

  return null;
}

/**
 * Native FCM. Tokens go to the same /api/push-tokens/register route the web
 * uses, tagged with the real platform so the sender picks the right payload.
 */
async function setUpPush(
  register: (handle: Promise<{ remove: () => void }>) => Promise<void>,
  router: ReturnType<typeof useRouter>,
  platform: 'ios' | 'android' | null
) {
  if (!platform) return;

  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

  // Tapping a notification should land on the thing it is about.
  await register(
    FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const link = (event.notification?.data as Record<string, unknown> | undefined)?.link;
      if (typeof link === 'string' && link.startsWith('/')) router.push(link);
    })
  );

  const { receive } = await FirebaseMessaging.requestPermissions();
  if (receive !== 'granted') return;

  const { token } = await FirebaseMessaging.getToken();
  if (!token) return;

  // Re-post an unchanged token too: the route touches last_used_at, which is
  // how stale devices get pruned.
  const res = await fetch('/api/push-tokens/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform }),
  });

  if (res.ok) {
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* private mode */
    }
  }
}

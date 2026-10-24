import { Capacitor } from '@capacitor/core';

export type NativePlatform = 'ios' | 'android';

/**
 * True only inside the Capacitor shell (see capacitor.config.ts). The same
 * bundle is served to mobile Safari and Chrome, where this stays false — use
 * it to gate anything that must not run in a browser tab.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}

export function getNativePlatform(): NativePlatform | null {
  if (!isNativeApp()) return null;
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : null;
}

export function isIOSApp(): boolean {
  return getNativePlatform() === 'ios';
}

export function isAndroidApp(): boolean {
  return getNativePlatform() === 'android';
}

/** The custom scheme Supabase redirects back to after OAuth. */
export const NATIVE_URL_SCHEME = 'com.myitutor.app';
export const NATIVE_OAUTH_REDIRECT = `${NATIVE_URL_SCHEME}://auth/callback`;

'use client';

import { useEffect, useState } from 'react';
import SocialLoginButton from '@/components/SocialLoginButton';
import { isIOSApp } from '@/lib/native/platform';

/**
 * App Review guideline 4.8: an app offering Google sign-in must offer an
 * equivalent privacy-preserving option. Apple sign-in is therefore required in
 * the iOS app — and shown only there, so the web and Android login pages are
 * unchanged.
 *
 * Resolved after mount; rendering it during SSR would mismatch hydration.
 */
export default function AppleSignInForIOS({ redirectTo }: { redirectTo?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isIOSApp());
  }, []);

  if (!show) return null;

  return <SocialLoginButton provider="apple" mode="login" redirectTo={redirectTo} />;
}

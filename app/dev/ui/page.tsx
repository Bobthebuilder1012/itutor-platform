/**
 * /dev/ui — every design-system component, with the same examples as the
 * design system's own previews, so the two can be compared side by side.
 *
 * GATED ON THE FLAG, AND 404s WHEN IT IS OFF. `notFound()` rather than a
 * "switched off" screen: this is a developer surface, and a 404 is the honest
 * answer for a route that is not meant to exist in that configuration.
 *
 * NEXT_PUBLIC_NEW_UI_ENABLED is inlined at build time, so flipping it needs a
 * redeploy — the same trade every NEXT_PUBLIC_ flag in this repo makes.
 */

import { notFound } from 'next/navigation';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import UiGallery from './UiGallery';

export const metadata = {
  title: 'iTutor design system',
  robots: { index: false, follow: false },
};

export default function DevUiPage() {
  if (!isNewUiEnabled()) notFound();
  return <UiGallery />;
}

import { notFound } from 'next/navigation';
import { isProductionRuntime } from '@/lib/email/allowlist';
import VerificationStatesGallery from '@/components/dev/VerificationStatesGallery';

// PREVIEW ONLY. Open in every non-production environment (staging, previews, local)
// unless VERIFICATION_DEV_TOOLS is explicitly "false"; always 404 in production. No
// login and no database: it makes no requests and shows no real data (see
// components/dev/galleryData.ts). Read per request so the switch needs no rebuild.
export const dynamic = 'force-dynamic';

export default function VerificationStatesPage() {
  if (isProductionRuntime() || (process.env.VERIFICATION_DEV_TOOLS ?? '').trim().toLowerCase() === 'false') notFound();
  return <VerificationStatesGallery />;
}

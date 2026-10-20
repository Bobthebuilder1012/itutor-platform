import { notFound } from 'next/navigation';
import VerificationStatesGallery from '@/components/dev/VerificationStatesGallery';

// DEV ONLY. 404 unless VERIFICATION_DEV_TOOLS=true AND this is not a production
// build. Read per request so the switch needs no rebuild. It makes no requests
// and shows no real data; see components/dev/galleryData.ts.
export const dynamic = 'force-dynamic';

export default function VerificationStatesPage() {
  if (process.env.VERIFICATION_DEV_TOOLS !== 'true' || process.env.NODE_ENV === 'production') notFound();
  return <VerificationStatesGallery />;
}

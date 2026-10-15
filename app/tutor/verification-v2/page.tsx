import { notFound } from 'next/navigation';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import TutorShell from '@/components/tutor/TutorShell';
import VerificationV2Flow from '@/components/tutor/verificationV2/VerificationV2Flow';

// The flag is read per request, so flipping VERIFICATION_V2_ENABLED needs no rebuild.
export const dynamic = 'force-dynamic';

export default function TutorVerificationV2Page() {
  if (!isVerificationV2Enabled()) notFound();

  return (
    <TutorShell>
      <VerificationV2Flow />
    </TutorShell>
  );
}

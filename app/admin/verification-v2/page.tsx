import { notFound } from 'next/navigation';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import AdminV2Queue from '@/components/admin/verificationV2/AdminV2Queue';

// Read per request so flipping VERIFICATION_V2_ENABLED needs no rebuild.
export const dynamic = 'force-dynamic';

export default function AdminVerificationV2Page() {
  if (!isVerificationV2Enabled()) notFound();
  return <AdminV2Queue />;
}

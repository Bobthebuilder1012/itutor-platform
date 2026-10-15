import { notFound } from 'next/navigation';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import AdminV2Review from '@/components/admin/verificationV2/AdminV2Review';

export const dynamic = 'force-dynamic';

export default function AdminVerificationV2ReviewPage({ params }: { params: { tutorId: string } }) {
  if (!isVerificationV2Enabled()) notFound();
  return <AdminV2Review tutorId={params.tutorId} />;
}

'use client';

import { useParams } from 'next/navigation';
import DisputeResponseView from '@/components/disputes/DisputeResponseView';

export const dynamic = 'force-dynamic';

export default function StudentDisputePage() {
  const params = useParams();
  const claimId = params.claimId as string;
  return <DisputeResponseView claimId={claimId} rolePath="/student" />;
}

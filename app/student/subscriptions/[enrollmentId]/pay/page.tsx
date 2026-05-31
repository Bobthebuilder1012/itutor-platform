'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function PayPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!enrollmentId) return;
    // Navigate to the renew API route which generates a fresh LuniPay checkout
    // and returns a 302 redirect to the checkout URL.
    window.location.href = `/api/subscriptions/${enrollmentId}/renew`;
  }, [enrollmentId]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Loader2 className="size-8 animate-spin text-brand" />
      <p className="text-sm text-muted-foreground">Generating checkout…</p>
    </div>
  );
}

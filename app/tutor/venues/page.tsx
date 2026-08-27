'use client';

/**
 * /tutor/venues — the standalone venue manager.
 *
 * The same component My Business renders as a tab. Both exist on purpose, and
 * the reason is in the spec: a tutor who changes premises must be able to edit
 * the address ONCE. Without a place that is obviously about venues, they edit
 * each class instead and the addresses drift apart — which surfaces as students
 * arriving at a building the tutor left months ago.
 *
 * A tab inside My Business is where you go while thinking about a class; a
 * route is where you go while thinking about a building, and it is what a
 * "manage your venues" link in an email or a support reply can point at.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import TutorShell from '@/components/tutor/TutorShell';
import VenuesTab from '@/components/tutor/VenuesTab';

export default function TutorVenuesPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }
    setChecked(true);
  }, [profile, loading, router]);

  if (!checked) {
    return (
      <TutorShell>
        <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading…</div>
      </TutorShell>
    );
  }

  return (
    <TutorShell>
      <div className="px-4 py-3 sm:px-0">
        <VenuesTab />
      </div>
    </TutorShell>
  );
}

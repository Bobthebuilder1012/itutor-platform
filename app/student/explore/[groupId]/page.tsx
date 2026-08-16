'use client';

// /student/explore/[groupId] — the student's entry to a class.
//
// The screen itself now lives in components/classes/ClassDetailView so the
// parent's class page can render the identical view. What stays here is what is
// genuinely student-specific: loading the class, the linked-parent lookup, and a
// join CTA that sends a signed-out visitor to log in first.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchClassDetail } from '@/lib/classes/fetchClassDetail';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import {
  Detail,
  Modal,
  JoinFlow,
  JoinedScreen,
  type GroupData,
  type Step,
} from '@/components/classes/ClassDetailView';

export default function ExploreClassDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('detail');
  const [hasLinkedParent, setHasLinkedParent] = useState(false);

  // Wait for the profile before fetching: the linked-parent lookup below needs
  // profile.id, and firing while it is still null used to silently skip it.
  useEffect(() => {
    if (!groupId || profileLoading) return;
    fetchGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, profile?.id, profileLoading]);

  async function fetchGroup() {
    try {
      const mapped = await fetchClassDetail(groupId);
      if (!mapped) { setLoading(false); return; }
      setGroup(mapped);

      // Check if student has a linked parent account
      if (profile?.id) {
        const { data: parentLink } = await supabase
          .from('parent_child_links')
          .select('parent_id')
          .eq('child_id', profile.id)
          .maybeSingle();
        setHasLinkedParent(!!parentLink);
      }
    } catch (err) {
      console.error('[ExploreClassDetail]', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || profileLoading) {
    return <div className="flex justify-center py-32"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  if (!group) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <h1 className="text-2xl font-bold text-ink">Class not found</h1>
        <Link href="/student/find-tutors" className="mt-4 inline-block text-brand-deep font-semibold">← Back to explore</Link>
      </div>
    );
  }

  return (
    <>
      <Detail
        group={group}
        onJoin={() => {
          // The page itself is public so a QR code or shared link opens for
          // anyone. Joining is where an account becomes necessary — send them
          // to sign in with `next` set, so they land back on this class and can
          // finish joining instead of being dumped on a dashboard.
          // `redirect` (not `next`) — that is the param the login page reads
          // when deciding where to send someone after sign-in.
          if (!profile?.id) {
            router.push(`/login?redirect=${encodeURIComponent(`/student/explore/${groupId}`)}`);
            return;
          }
          setStep('join');
        }}
      />
      {step !== 'detail' && (
        <Modal onClose={() => setStep('detail')}>
          {step === 'join' && (
            <JoinFlow
              group={group}
              onBack={() => setStep('detail')}
              // Re-read membership so dismissing the modal leaves the CTA showing
              // "Open class" / "Request pending" rather than the stale join label.
              onSuccess={(s) => { setStep(s); void fetchGroup(); }}
              profile={profile}
              hasLinkedParent={hasLinkedParent}
            />
          )}
          {step === 'joined' && <JoinedScreen group={group} kind="enrolled" />}
          {step === 'awaiting-approval' && <JoinedScreen group={group} kind="awaiting-approval" />}
        </Modal>
      )}
    </>
  );
}


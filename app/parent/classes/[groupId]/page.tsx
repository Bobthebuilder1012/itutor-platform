'use client';

// A class, as a parent sees it before paying for it — and it is the SAME screen
// the student sees. <Detail> is the view from /student/explore/[groupId]; this
// route supplies the parent shell, the parent's CTA, and nothing else.
//
// It used to be a thinner parent-only page: banner, tutor, schedule, price. That
// was a second description of one class, and the parent got the worse of the two
// — no reviews, no "what secure-your-spot means", no session agenda — while being
// the person least able to judge the class without them. A student has sat in
// classes like it; a parent is buying on the page alone.
//
// THE ORDER: read the class, choose the child, then pay. Choosing the child runs
// the §5 checks through ChildPickerCheck, and a schedule clash or level mismatch
// can refuse the enrolment. That has to happen before a card is entered, which is
// the whole reason it is a step and not a dropdown on the payment form.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Users, X } from 'lucide-react';
import ParentShell from '@/components/parent/ParentShell';
import ChildPickerCheck from '@/components/parent/ChildPickerCheck';
import { Detail, type GroupData } from '@/components/classes/ClassDetailView';
import { fetchClassDetail } from '@/lib/classes/fetchClassDetail';
import { isPaidGroup } from '@/lib/payments/groupPricing';

export default function ParentClassPage() {
  return (
    <ParentShell>
      <ClassContent />
    </ParentShell>
  );
}

function ClassContent() {
  const { groupId } = useParams<{ groupId: string }>();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readyChildId, setReadyChildId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Same loader the student page uses, so the two cannot disagree about what
    // this class is.
    const mapped = await fetchClassDetail(groupId);
    setGroup(mapped);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-2xl font-bold text-ink">Class not found</h1>
        <Link href="/parent/classes" className="mt-4 inline-block font-semibold text-brand-deep">
          ← Back to classes
        </Link>
      </div>
    );
  }

  // The same predicate the server uses, so the page cannot send a free class to
  // checkout or a paid one to the free join route. price_monthly alone was close
  // but not identical; isPaidGroup is the one definition.
  const isPaid = isPaidGroup(group);

  const enroll = async (childId: string) => {
    setBusy(true);
    setError(null);
    try {
      // Paid goes through checkout; free joins directly. The direct route still
      // refuses anything priced, so a mistake here cannot hand out a paid seat.
      const res = await fetch(
        isPaid ? '/api/parent/enroll-child/subscribe' : '/api/parent/enroll-child',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId, groupId: group.id }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not continue.');
        return;
      }
      if (res.status === 202 && json.waitlisted) {
        setError(`This class is full — your child is number ${json.position} on the waitlist.`);
        setPickerOpen(false);
        return;
      }
      if (isPaid && json.checkout_url) {
        window.location.href = json.checkout_url;
        return;
      }
      setPickerOpen(false);
      await load();
    } catch {
      setError('Could not continue.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* No back link here: <Detail> renders its own "← All classes", and two
          of them stacked is what the parent page used to show. */}
      {error && (
        <p className="mb-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* Every CTA inside the view funnels through onJoin, so the parent flow
          replaces the student's join without the view knowing which it is. */}
      <Detail
        group={group}
        variant="parent"
        onJoin={() => {
          setError(null);
          setReadyChildId(null);
          setPickerOpen(true);
        }}
      />

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={() => setPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto w-full max-w-md space-y-3 rounded-2xl border border-border bg-background p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-ink">Who is this for?</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isPaid
                    ? 'You pay; they are the one enrolled.'
                    : 'They are the one enrolled.'}
                </p>
              </div>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-muted-foreground hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* The dialog's own h2 already asks it. */}
            <ChildPickerCheck groupId={group.id} onReady={setReadyChildId} showHeading={false} />

            <button
              onClick={() => readyChildId && enroll(readyChildId)}
              disabled={!readyChildId || busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
              {isPaid
                ? 'Continue to payment'
                : group.require_join_requests
                  ? 'Send request'
                  : 'Join class'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

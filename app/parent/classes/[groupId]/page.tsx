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
import { Check, Clock, Loader2, Users, X } from 'lucide-react';
import ParentShell from '@/components/parent/ParentShell';
import ChildPickerCheck from '@/components/parent/ChildPickerCheck';
import { Detail, preorderFor, type GroupData } from '@/components/classes/ClassDetailView';
import { fetchClassDetail } from '@/lib/classes/fetchClassDetail';
import { hasAnyPrice } from '@/lib/payments/groupPricing';

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
  /** Set once the enrolment has actually happened — the modal then reports it. */
  const [done, setDone] = useState<{
    kind: 'enrolled' | 'requested' | 'waitlisted';
    childName: string | null;
    position: number | null;
  } | null>(null);

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

  // WHICH PREDICATE DECIDES THE ROUTE
  //
  // hasAnyPrice, not isPaidGroup — because the free route accepts exactly
  // !hasAnyPrice and refuses everything else with a 402. Routing on the wider
  // test is what makes the two sides agree by construction rather than by
  // both happening to read the same fields.
  //
  // isPaidGroup also asks about pricing_model, and this page is holding an API
  // payload, not a database row: on production the winning select in
  // /api/groups/[groupId] omitted pricing_model entirely, so a TT$130/mo class
  // answered isPaidGroup() === false and every parent enrolling a child hit
  // "This class is paid. Use the subscribe flow" — from the free route they
  // should never have been sent to. The select is fixed, but the page should
  // not be one absent field away from giving a paid seat away for nothing.
  //
  // A price the parent can SEE is the honest test, and it is the one the
  // student's own JoinFlow already uses (`price > 0` → subscribe). The two
  // paths through the same <Detail> now decide this the same way.
  const isPaid = hasAnyPrice(group);

  // A class that has not started yet is sold as a one-time held charge, not a
  // subscription — and the parent has to be buying the same product as the
  // student, or the two of them end up on different billing terms for the same
  // seat. This page used to send every priced class to /subscribe, which meant
  // a preorder class became a recurring subscription in a parent's hands, and
  // failed outright once the child had a secure-spot hold of their own.
  const isPreorder = Boolean(preorderFor(group));

  const enroll = async (childId: string) => {
    setBusy(true);
    setError(null);
    try {
      // Preorder before price: a free preorder class is still a reservation, and
      // routing it to the plain join would give the child a roster row where the
      // student path gives them a held place. The direct route still refuses
      // anything priced, so a mistake here cannot hand out a paid seat.
      const endpoint = isPreorder
        ? '/api/parent/enroll-child/secure-spot'
        : isPaid
          ? '/api/parent/enroll-child/subscribe'
          : '/api/parent/enroll-child';

      const res = await fetch(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId, groupId: group.id }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        // detail carries the database's own words when a write fails. Without it
        // the banner said only "Failed to create enrollment", which named
        // neither the cause nor anything a parent could do about it.
        setError([json.error, json.detail].filter(Boolean).join(' — ') || 'Could not continue.');
        return;
      }
      if (res.status === 202 && json.waitlisted) {
        // A waitlist place is an outcome, not a failure — it used to be shown in
        // the red error banner, which read as "that did not work" to a parent
        // who had in fact just been given a position in the queue.
        setDone({ kind: 'waitlisted', childName: json.childName ?? null, position: json.position ?? null });
        return;
      }
      if (json.checkout_url) {
        window.location.href = json.checkout_url;
        return;
      }
      // A free reservation completes without Stripe — there is no checkout to
      // send them to, and the place is already held.
      if (json.free) {
        setDone({ kind: 'enrolled', childName: json.childName ?? null, position: null });
        await load();
        return;
      }
      // The modal used to close on success and say nothing at all. A parent who
      // has just enrolled somebody else needs to be told it happened, to whom,
      // and — when the tutor gates joins — that it is not finished yet.
      setDone({
        kind: json.status === 'pending' ? 'requested' : 'enrolled',
        childName: json.childName ?? null,
        position: null,
      });
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
          // Clearing `done` matters: dismissing on the backdrop without it would
          // leave the confirmation staged, and the next Join press would open on
          // a message about the enrolment before it.
          onClick={() => {
            setPickerOpen(false);
            setDone(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto w-full max-w-md space-y-3 rounded-2xl border border-border bg-background p-5 shadow-xl"
          >
            {done ? (
              <Confirmation
                done={done}
                className={group.name}
                onClose={() => {
                  setDone(null);
                  setPickerOpen(false);
                }}
              />
            ) : (
              <>
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
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}

/**
 * What happened, said plainly, before the modal closes.
 *
 * Three outcomes, and the difference between them matters to a parent: enrolled
 * is finished, requested is not, and a waitlist place is neither a failure nor a
 * seat. The old flow closed the modal silently on the first, and put the third
 * in the red error banner.
 */
function Confirmation({
  done,
  className,
  onClose,
}: {
  done: { kind: 'enrolled' | 'requested' | 'waitlisted'; childName: string | null; position: number | null };
  className: string;
  onClose: () => void;
}) {
  const who = done.childName ?? 'Your child';

  const copy = {
    enrolled: {
      title: `${who} is in ${className}`,
      body: 'They can see the class and its sessions on their own account now. You will get their attendance and any feedback the tutor writes.',
    },
    requested: {
      title: `Request sent for ${who}`,
      body: `The tutor approves who joins ${className}. Nothing else is needed from you — you will hear when they answer, and ${who} is not in the class until they do.`,
    },
    waitlisted: {
      title: `${who} is on the waitlist`,
      body: done.position
        ? `The class is full. They are number ${done.position} in the queue, and we will tell you if a place opens.`
        : 'The class is full. We will tell you if a place opens.',
    },
  }[done.kind];

  return (
    <div className="space-y-4 text-center">
      <div
        className={`mx-auto mt-1 grid size-12 place-items-center rounded-2xl ${
          done.kind === 'waitlisted' ? 'bg-amber-500' : 'bg-brand'
        }`}
      >
        {done.kind === 'waitlisted' ? (
          <Clock className="size-6 text-white" />
        ) : (
          <Check className="size-6 text-white" />
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-ink">{copy.title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{copy.body}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <Link
          href="/parent/children"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
        >
          See their classes
        </Link>
        <button
          onClick={onClose}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink hover:bg-muted"
        >
          Done
        </button>
      </div>
    </div>
  );
}

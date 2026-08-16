'use client';

// A class, as a parent sees it before paying for it.
//
// The marketplace card used to go straight from "Subscribe for child" into a
// payment. That asks someone to buy a thing they have not read: the card carries
// a name, a price and one line of schedule, and a parent — unlike a student — has
// not sat in the class or spoken to the tutor. This is the page in between.
//
// It mirrors the student's /student/explore/[groupId] and reads the SAME
// /api/groups/[groupId] endpoint, so the class a parent is shown is the class the
// student sees, not a parent-flavoured summary that can drift from it.
//
// THE ORDER IS DELIBERATE: read the class, then choose the child, then pay.
// Choosing the child is not a dropdown on a payment form — it runs the §5 checks
// (schedule clash, level mismatch) through ChildPickerCheck, and those can refuse
// the enrolment. Refusing before a card is entered is the whole point.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CalendarDays, CreditCard, Loader2, Star, Users, X,
} from 'lucide-react';
import ParentShell from '@/components/parent/ParentShell';
import ChildPickerCheck from '@/components/parent/ChildPickerCheck';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { classCapacityDisplay } from '@/lib/utils/classCapacity';
import { gradientFor } from '@/components/parent/ParentClassCard';
import { cn } from '@/lib/utils';

type ClassData = {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  formLevel: string | null;
  coverImage: string | null;
  priceMonthly: number | null;
  pricingModel: string | null;
  maxStudents: number | null;
  memberCount: number;
  requireJoinRequests: boolean;
  tutorId: string | null;
  tutorName: string;
  rating: number | null;
  scheduleLines: string[];
  startDate: string | null;
  endDate: string | null;
};

export default function ParentClassPage() {
  return (
    <ParentShell>
      <ClassContent />
    </ParentShell>
  );
}

function ClassContent() {
  const { groupId } = useParams<{ groupId: string }>();
  const [data, setData] = useState<ClassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readyChildId, setReadyChildId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}`, { cache: 'no-store' });
      if (!res.ok) return;
      const payload = await res.json();
      const g = payload?.group ?? payload?.data?.group ?? payload;
      if (!g) return;
      const tutorObj = Array.isArray(g.tutor) ? g.tutor[0] : g.tutor;

      // Recurrence collapsed to readable lines, same source the student page uses.
      const lines: string[] = Array.isArray(g.sessions)
        ? g.sessions
            .map((s: any) => {
              const days = Array.isArray(s.recurrence_days) ? s.recurrence_days.join(', ') : null;
              const time = s.start_time ? String(s.start_time).slice(0, 5) : null;
              return [days, time].filter(Boolean).join(' · ') || null;
            })
            .filter(Boolean)
        : [];

      setData({
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        subject: g.subject ?? null,
        formLevel: g.form_level ?? null,
        coverImage: g.cover_image ?? null,
        priceMonthly: g.price_monthly ?? null,
        pricingModel: g.pricing_model ?? null,
        maxStudents: g.max_students ?? null,
        memberCount: Number(g.member_count ?? 0),
        requireJoinRequests: !!g.require_join_requests,
        tutorId: tutorObj?.id ?? null,
        tutorName: tutorObj?.display_name || tutorObj?.full_name || 'Tutor',
        rating: g.average_rating ?? tutorObj?.rating_average ?? null,
        scheduleLines: lines,
        startDate: g.start_date ?? null,
        endDate: g.end_date ?? null,
      });
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-background p-6">
        <p className="text-sm text-ink">This class is not available.</p>
        <Link href="/parent/classes" className="mt-2 inline-block text-sm font-semibold text-brand-deep hover:underline">
          Back to classes
        </Link>
      </div>
    );
  }

  const isPaid = (data.priceMonthly ?? 0) > 0 || data.pricingModel === 'MONTHLY';
  const capacity = data.maxStudents
    ? classCapacityDisplay(data.memberCount, data.maxStudents)
    : null;
  const isFull = data.maxStudents ? data.memberCount >= data.maxStudents : false;

  const enroll = async (childId: string) => {
    setPaying(true);
    setError(null);
    try {
      // Paid goes through checkout; free is a direct join. The two endpoints are
      // separate on purpose — the direct one refuses paid classes outright.
      const res = await fetch(
        isPaid ? '/api/parent/enroll-child/subscribe' : '/api/parent/enroll-child',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId, groupId: data.id }),
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
      setPaying(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Link
        href="/parent/classes"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="size-4" /> All classes
      </Link>

      <section className="overflow-hidden rounded-2xl border border-border bg-background">
        <div
          className={cn('h-40 w-full', !data.coverImage && `bg-gradient-to-br ${gradientFor(data.name)}`)}
          style={
            data.coverImage
              ? { backgroundImage: `url(${data.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
        />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-ink sm:text-2xl">{data.name}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                by {data.tutorName}
                {data.subject ? ` · ${data.subject}` : ''}
                {data.formLevel ? ` · ${data.formLevel}` : ''}
              </p>
            </div>
            {data.rating != null && data.rating > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                <Star className="size-3 fill-amber-500 text-amber-500" /> {data.rating.toFixed(1)}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {data.requireJoinRequests && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                Approval required
              </span>
            )}
            {capacity?.kind === 'spots_left' && (
              <span className="rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-bold text-coral">
                {capacity.label}
              </span>
            )}
          </div>

          {data.scheduleLines.length > 0 && (
            <div className="mt-4 flex items-start gap-2 text-sm text-ink">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                {data.scheduleLines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>
          )}

          {data.description && (
            <div className="mt-4 border-t border-border pt-4">
              <h2 className="text-sm font-bold text-ink">About this class</h2>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {data.description}
              </p>
            </div>
          )}
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {/* The commitment, stated before the button that starts it. */}
      <section className="rounded-2xl border border-border bg-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {isPaid ? (
              <>
                <span className="text-2xl font-bold text-ink">{fmtTTD(data.priceMonthly ?? 0)}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </>
            ) : (
              <span className="text-2xl font-bold text-brand-deep">Free</span>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {isPaid
                ? 'You pay; your child is the one enrolled. You choose which child next.'
                : 'No payment. You choose which child next.'}
            </p>
          </div>
          <button
            onClick={() => { setError(null); setReadyChildId(null); setPickerOpen(true); }}
            disabled={isFull}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition',
              isFull
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'bg-brand text-white hover:bg-brand-deep'
            )}
          >
            <CreditCard className="size-4" />
            {isFull ? 'Class full' : isPaid ? 'Continue to checkout' : 'Continue'}
          </button>
        </div>
      </section>

      {/* Child choice + the §5 checks. Deliberately AFTER reading the class and
          BEFORE any card details: a clash or a level mismatch should stop the
          enrolment while stopping it is still free. */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex overflow-y-auto bg-black/40 p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto w-full max-w-md space-y-3 rounded-2xl border border-border bg-background p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-bold text-ink">Who is this for?</h2>
              <button onClick={() => setPickerOpen(false)} className="text-muted-foreground hover:text-ink">
                <X className="size-4" />
              </button>
            </div>

            <ChildPickerCheck
              groupId={data.id}
              onReady={setReadyChildId}
            />

            <button
              onClick={() => readyChildId && enroll(readyChildId)}
              disabled={!readyChildId || paying}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
            >
              {paying ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
              {isPaid ? 'Continue to payment' : data.requireJoinRequests ? 'Send request' : 'Join class'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

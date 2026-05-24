'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Star, Calendar, Clock, Users, FileText, BadgeCheck,
  Check, Lock, ShieldCheck, X, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKET_CLASSES, classState, LOW_STOCK_THRESHOLD, type MarketClass } from '@/lib/mock';

type FlowStep = 'detail' | 'join' | 'confirm-terms' | 'joined' | 'awaiting-approval' | 'awaiting-consent' | 'parent-consent';

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const c = MARKET_CLASSES.find((x) => x.id === id);
  const [step, setStep] = useState<FlowStep>('detail');

  if (!c) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <h1 className="text-2xl font-bold text-ink">Class not found</h1>
        <Link href="/student/classes" className="mt-4 inline-block text-brand-deep font-semibold">← Back to browse</Link>
      </div>
    );
  }

  if (step === 'parent-consent') return <ParentConsentScreen c={c} />;
  if (step === 'join') return <JoinFlow c={c} onBack={() => setStep('detail')} onDone={(s) => setStep(s)} />;
  if (step === 'confirm-terms') return <ConfirmTermsScreen c={c} onBack={() => setStep('detail')} onDone={() => setStep('joined')} />;
  if (step === 'joined') return <OutcomeScreen c={c} kind="joined" />;
  if (step === 'awaiting-approval') return <OutcomeScreen c={c} kind="awaiting-approval" />;
  if (step === 'awaiting-consent') return <OutcomeScreen c={c} kind="awaiting-consent" />;
  return <Detail c={c} onCta={(s) => setStep(s)} />;
}

function Detail({ c, onCta }: { c: MarketClass; onCta: (step: FlowStep) => void }) {
  const state = classState(c);
  const remaining = c.seatsTotal - c.seatsTaken;
  const isFull = state === 'full';
  const isLowStock = !isFull && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD;

  const cta: { label: string; step: FlowStep; tone: string } =
    state === 'full' ? { label: 'Join Waitlist', step: 'join', tone: 'bg-ink text-white' }
    : state === 'recurring-1on1' ? { label: 'Review terms & confirm', step: 'confirm-terms', tone: 'bg-brand text-white' }
    : state === 'approval-required' ? { label: 'Request to join', step: 'join', tone: 'bg-brand text-white' }
    : { label: 'Join class', step: 'join', tone: 'bg-brand text-white' };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/student/classes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> All classes
      </Link>

      <section className={`relative rounded-3xl bg-gradient-to-br ${c.bannerFrom} ${c.bannerTo} p-6 sm:p-8 text-white overflow-hidden`}>
        <div className="flex items-start gap-4">
          <div className="size-16 rounded-2xl bg-white grid place-items-center text-4xl shadow-md shrink-0">{c.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider font-bold opacity-90">{c.subject} · {c.level}</div>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">{c.title}</h1>
            <p className="text-sm opacity-95 mt-2">{c.shortBlurb}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {c.includesParentFeedback && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white/95 text-ink">
              <FileText className="size-3" /> Monthly parent feedback
            </span>
          )}
          {c.kind === 'recurring-1on1' && (
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white/95 text-ink">Recurring 1:1</span>
          )}
          {c.approvalRequired && c.kind === 'group' && (
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white/95 text-ink">Approval required</span>
          )}
        </div>
      </section>

      <Link href={`/student/tutors/${c.tutorId}`} className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-background hover:bg-muted/40 transition">
        <div className="size-12 rounded-full grid place-items-center font-bold text-ink shrink-0"
          style={{ background: `oklch(0.85 0.1 ${c.tutorHue})` }}>
          {c.tutorName.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p) => p[0]).join('').slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-ink truncate">{c.tutorName}</span>
            <BadgeCheck className="size-4 text-brand-deep shrink-0" />
          </div>
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Star className="size-3 fill-coral text-coral" />
            <span className="font-semibold text-ink">{c.tutorRating}</span>
            <span>({c.tutorReviews} reviews)</span>
          </div>
        </div>
        <span className="text-xs text-brand-deep font-semibold">View profile →</span>
      </Link>

      <section className="rounded-2xl border border-border bg-background p-5 space-y-3">
        <h2 className="font-bold text-ink">Schedule</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Row icon={<Calendar className="size-4 text-brand-deep" />} label="When" value={c.schedule} />
          <Row icon={<Clock className="size-4 text-brand-deep" />} label="Cadence" value={c.cadence} />
          <Row icon={<Users className="size-4 text-brand-deep" />} label={c.kind === 'recurring-1on1' ? 'Format' : 'Seats'}
            value={c.kind === 'recurring-1on1' ? 'Private 1:1' : `${c.seatsTaken}/${c.seatsTotal} enrolled${isLowStock ? ` · only ${remaining} left` : ''}`} />
          <Row icon={<Calendar className="size-4 text-brand-deep" />} label="Starts" value={c.startDate} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h2 className="font-bold text-ink mb-3">What's included</h2>
        <ul className="space-y-2">
          {c.whatsIncluded.map((w) => (
            <li key={w} className="flex items-start gap-2 text-sm text-ink">
              <Check className="size-4 text-brand-deep mt-0.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      </section>

      <div className="rounded-2xl border border-border bg-background p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{c.billing}</div>
          <div className="text-2xl font-bold text-ink mt-0.5">TT${c.price}
            {c.originalPrice && <span className="text-sm font-normal text-muted-foreground line-through ml-2">TT${c.originalPrice}</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{c.billingDescription}</div>
          {isFull && <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground"><Lock className="size-3" /> Class full</div>}
          {isLowStock && <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-coral-soft text-coral">Only {remaining} spot{remaining === 1 ? '' : 's'} left</div>}
        </div>
        <button onClick={() => onCta(cta.step)}
          className={cn('inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm hover:opacity-90 transition', cta.tone)}>
          {cta.label} <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function JoinFlow({ c, onBack, onDone }: { c: MarketClass; onBack: () => void; onDone: (s: FlowStep) => void }) {
  const state = classState(c);
  const isFull = state === 'full';
  const needsApproval = state === 'approval-required';
  const [agreed, setAgreed] = useState(false);

  const heading = isFull ? 'Join the waitlist' : needsApproval ? 'Request to join' : 'Confirm your spot';
  const ctaLabel = isFull ? 'Join Waitlist' : needsApproval ? 'Send request' : 'Confirm & enroll';
  const nextStep: FlowStep = needsApproval ? 'awaiting-approval' : isFull ? 'awaiting-approval' : 'joined';

  return (
    <div className="max-w-md mx-auto space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="rounded-3xl border border-border bg-background p-6 space-y-5">
        <h1 className="text-xl font-bold text-ink">{heading}</h1>
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40">
          <div className="text-2xl">{c.emoji}</div>
          <div>
            <div className="font-semibold text-ink">{c.title}</div>
            <div className="text-xs text-muted-foreground">{c.tutorName} · TT${c.price}/{c.billing === 'per-month' ? 'mo' : 'session'}</div>
          </div>
        </div>
        {!isFull && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 rounded border-border text-brand focus:ring-brand" />
            <span className="text-sm text-ink">I agree to the billing terms: <span className="text-muted-foreground">{c.billingDescription}</span></span>
          </label>
        )}
        <button disabled={!isFull && !agreed} onClick={() => onDone(nextStep)}
          className={cn('w-full py-3 rounded-2xl font-semibold text-sm', agreed || isFull ? 'bg-brand text-white hover:bg-brand-deep' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

function ConfirmTermsScreen({ c, onBack, onDone }: { c: MarketClass; onBack: () => void; onDone: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="max-w-md mx-auto space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="rounded-3xl border border-border bg-background p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="text-3xl">{c.emoji}</div>
          <div>
            <h1 className="text-lg font-bold text-ink">Review your recurring commitment</h1>
            <div className="text-xs text-muted-foreground">{c.tutorName}</div>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Schedule</span>
            <span className="font-semibold text-ink">{c.schedule}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Price</span>
            <span className="font-semibold text-ink">TT${c.price} per session</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Billing</span>
            <span className="font-semibold text-ink">Charged monthly</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Cancellation</span>
            <span className="font-semibold text-ink">14 days notice required</span>
          </div>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 rounded border-border text-brand focus:ring-brand" />
          <span className="text-sm text-ink">I understand this is a recurring weekly commitment and agree to the terms above.</span>
        </label>
        <button disabled={!agreed} onClick={onDone}
          className={cn('w-full py-3 rounded-2xl font-semibold text-sm', agreed ? 'bg-brand text-white hover:bg-brand-deep' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
          Confirm & start sessions
        </button>
      </div>
    </div>
  );
}

function OutcomeScreen({ c, kind }: { c: MarketClass; kind: 'joined' | 'awaiting-approval' | 'awaiting-consent' }) {
  const meta = {
    joined: { icon: <Check className="size-6 text-white" />, bg: 'bg-brand', title: "You're in! 🎉", body: "You've been enrolled in this class. Check your email for next steps.", link: '/student/lessons', linkLabel: 'Go to My Classes' },
    'awaiting-approval': { icon: <Clock className="size-6 text-white" />, bg: 'bg-sky', title: 'Request sent', body: 'The tutor will review your request. You\'ll be notified once approved.', link: '/student/classes', linkLabel: 'Browse more classes' },
    'awaiting-consent': { icon: <ShieldCheck className="size-6 text-white" />, bg: 'bg-lavender', title: 'Almost there', body: 'Your parent needs to approve and pay for this class. They\'ve been notified.', link: '/student/classes', linkLabel: 'Browse more classes' },
  }[kind];

  return (
    <div className="max-w-sm mx-auto text-center py-16 space-y-5">
      <div className={cn('size-14 rounded-2xl grid place-items-center mx-auto', meta.bg)}>{meta.icon}</div>
      <h1 className="text-2xl font-bold text-ink">{meta.title}</h1>
      <p className="text-sm text-muted-foreground">{meta.body}</p>
      <Link href={meta.link} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-brand text-white font-semibold text-sm hover:bg-brand-deep">
        {meta.linkLabel}
      </Link>
    </div>
  );
}

function ParentConsentScreen({ c }: { c: MarketClass }) {
  return (
    <div className="max-w-sm mx-auto text-center py-16 space-y-5">
      <div className="size-14 rounded-2xl bg-brand-soft grid place-items-center mx-auto">
        <ShieldCheck className="size-6 text-brand-deep" />
      </div>
      <h1 className="text-xl font-bold text-ink">Parent consent required</h1>
      <p className="text-sm text-muted-foreground">Your parent will receive a notification to approve and pay for <span className="font-semibold text-ink">{c.title}</span>. You'll be enrolled once they confirm.</p>
      <Link href="/student/classes" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl border border-border bg-background text-ink font-semibold text-sm hover:bg-muted">
        ← Back to Browse
      </Link>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <div>
        <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
        <div className="font-semibold text-ink">{value}</div>
      </div>
    </div>
  );
}


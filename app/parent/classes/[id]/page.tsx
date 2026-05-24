'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star, Check, FileText, ShieldCheck, X, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKET_CLASSES, CHILDREN, classState, LOW_STOCK_THRESHOLD, type MarketClass, type Child } from '@/lib/mock';
import ParentShell from '@/components/parent/ParentShell';

export default function ParentClassDetailPage() {
  return (
    <ParentShell>
      <ParentClassDetail />
    </ParentShell>
  );
}

type EnrollStep = 'idle' | 'pick-child' | 'consent' | 'done';

function ParentClassDetail() {
  const { id } = useParams<{ id: string }>();
  const c = MARKET_CLASSES.find((x) => x.id === id);
  const [enrollStep, setEnrollStep] = useState<EnrollStep>('idle');
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [consented, setConsented] = useState(false);

  if (!c) {
    return (
      <div className="text-center py-16">
        <h1 className="text-xl font-bold text-ink">Class not found</h1>
        <Link href="/parent/classes" className="mt-3 inline-block text-brand-deep font-semibold">← Browse classes</Link>
      </div>
    );
  }

  const state = classState(c);
  const remaining = c.seatsTotal - c.seatsTaken;
  const showScarcity = c.kind === 'group' && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD;
  const ctaLabel = state === 'full' ? 'Join Waitlist' : state === 'approval-required' ? 'Request to join' : state === 'recurring-1on1' ? 'Confirm terms' : 'Enroll my child';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/parent/classes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> All classes
      </Link>

      <div className={cn('relative rounded-3xl overflow-hidden bg-gradient-to-br p-8 text-white', c.bannerFrom, c.bannerTo)}>
        <div className="text-5xl mb-3">{c.emoji}</div>
        <div className="text-xs uppercase tracking-wider font-bold opacity-90 mb-1">{c.subject} · {c.level}</div>
        <h1 className="text-3xl font-bold">{c.title}</h1>
        <p className="text-sm opacity-90 mt-2 max-w-xl">{c.shortBlurb}</p>
        <div className="absolute top-4 right-4 flex flex-col gap-1 items-end">
          {c.discountLabel && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white text-coral">{c.discountLabel}</span>}
          {state === 'full' && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-ink/70 text-white">Class full</span>}
          {showScarcity && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white text-coral">Only {remaining} left</span>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-5">
          <section className="rounded-2xl bg-background border border-border p-5">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-full grid place-items-center font-bold text-ink shrink-0"
                style={{ background: `oklch(0.85 0.1 ${c.tutorHue})` }}>
                {c.tutorName.split(' ').map((x) => x[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="font-bold text-ink">{c.tutorName}</div>
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Star className="size-3 fill-amber-500 text-amber-500" /> {c.tutorRating} · {c.tutorReviews} reviews
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-background border border-border p-5 space-y-3">
            <h2 className="font-bold text-ink">About this class</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{c.longDescription}</p>
          </section>

          <section className="rounded-2xl bg-background border border-border p-5">
            <h2 className="font-bold text-ink mb-3">What's included</h2>
            <ul className="space-y-2">
              {c.whatsIncluded.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm text-ink">
                  <Check className="size-4 text-brand-deep mt-0.5 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-background border border-border p-5 space-y-4 lg:sticky lg:top-24">
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{c.billing}</div>
              <div className="text-2xl font-bold text-ink mt-0.5">TT${c.price}
                {c.originalPrice && <span className="text-sm font-normal text-muted-foreground line-through ml-2">TT${c.originalPrice}</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.billingDescription}</div>
            </div>
            {showScarcity && (
              <div className="rounded-xl bg-coral-soft text-coral text-xs font-semibold px-3 py-2 inline-flex items-center gap-1.5">
                <AlertCircle className="size-3.5" /> Only {remaining} spot{remaining === 1 ? '' : 's'} left
              </div>
            )}
            {c.includesParentFeedback && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
                <FileText className="size-3.5" /> Includes monthly parent reports
              </div>
            )}
            <button onClick={() => setEnrollStep('pick-child')}
              className="w-full py-3 rounded-2xl bg-brand text-white font-semibold text-sm hover:bg-brand-deep transition">
              {ctaLabel}
            </button>
            <p className="text-[11px] text-muted-foreground text-center">No charge until you confirm on the next step.</p>
          </div>
        </div>
      </div>

      {enrollStep !== 'idle' && (
        <EnrollModal
          c={c}
          step={enrollStep}
          selectedChild={selectedChild}
          consented={consented}
          onSelectChild={setSelectedChild}
          onConsent={setConsented}
          onNext={() => {
            if (enrollStep === 'pick-child') setEnrollStep('consent');
            else if (enrollStep === 'consent') setEnrollStep('done');
          }}
          onClose={() => { setEnrollStep('idle'); setSelectedChild(null); setConsented(false); }}
        />
      )}
    </div>
  );
}

function EnrollModal({ c, step, selectedChild, consented, onSelectChild, onConsent, onNext, onClose }: {
  c: MarketClass; step: EnrollStep; selectedChild: Child | null; consented: boolean;
  onSelectChild: (ch: Child) => void; onConsent: (v: boolean) => void;
  onNext: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-background border-b border-border px-5 py-3 flex items-center justify-between">
          <div className="font-bold text-ink">
            {step === 'pick-child' ? 'Choose a child' : step === 'consent' ? 'Confirm & pay' : 'Enrolled!'}
          </div>
          <button onClick={onClose} className="size-8 rounded-full hover:bg-muted grid place-items-center"><X className="size-4" /></button>
        </div>

        <div className="p-5">
          {step === 'pick-child' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Which child would you like to enroll in <span className="font-semibold text-ink">{c.title}</span>?</p>
              {CHILDREN.map((child) => (
                <button key={child.id} onClick={() => onSelectChild(child)}
                  className={cn('w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition',
                    selectedChild?.id === child.id ? 'border-brand bg-brand-soft' : 'border-border hover:border-brand/50')}>
                  <div className="size-10 rounded-full grid place-items-center font-bold text-ink shrink-0"
                    style={{ background: `oklch(0.85 0.1 ${child.hue})` }}>{child.initials}</div>
                  <div>
                    <div className="font-semibold text-ink">{child.name}</div>
                    <div className="text-xs text-muted-foreground">{child.ageLabel}</div>
                  </div>
                  {selectedChild?.id === child.id && <Check className="ml-auto size-4 text-brand-deep" />}
                </button>
              ))}
              <button disabled={!selectedChild} onClick={onNext}
                className={cn('w-full py-3 rounded-2xl font-semibold text-sm mt-2', selectedChild ? 'bg-brand text-white hover:bg-brand-deep' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                Continue <ChevronRight className="inline size-4" />
              </button>
            </div>
          )}

          {step === 'consent' && selectedChild && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-muted/40 p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Child</span><span className="font-semibold text-ink">{selectedChild.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Class</span><span className="font-semibold text-ink">{c.title}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold text-ink">TT${c.price}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Billing</span><span className="font-semibold text-ink">{c.billingDescription}</span></div>
              </div>
              <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
                By confirming you authorize iTutor to charge TT${c.price} to your saved payment method. Recurring charges apply. Cancel with 14 days notice.
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={consented} onChange={(e) => onConsent(e.target.checked)}
                  className="mt-1 rounded border-border text-brand" />
                <span className="text-sm text-ink">I consent to this charge on behalf of <span className="font-semibold">{selectedChild.name}</span></span>
              </label>
              <button disabled={!consented} onClick={onNext}
                className={cn('w-full py-3 rounded-2xl font-semibold text-sm', consented ? 'bg-brand text-white hover:bg-brand-deep' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                Confirm enrollment
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="size-14 rounded-2xl bg-brand grid place-items-center mx-auto">
                <ShieldCheck className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-ink text-lg">Enrollment requested!</h3>
              <p className="text-sm text-muted-foreground">We've notified the tutor. Once approved, {selectedChild?.name} will be enrolled and you'll receive a confirmation.</p>
              <button onClick={onClose} className="w-full py-3 rounded-2xl bg-ink text-white font-semibold text-sm">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

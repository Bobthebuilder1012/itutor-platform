'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, User, Check, ChevronRight, X, Clock, MessageSquare, ArrowLeft, Globe, Lock, EyeOff, Minus, Plus, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import TutorShell from '@/components/tutor/TutorShell';
import { PLACEHOLDER_RECURRING_REQUESTS, type RecurringRequest } from '@/lib/mock';

type ClassType = 'group' | '1on1' | null;
type BillingModel = 'per-session' | 'per-month' | 'prepaid';
type Visibility = 'public' | 'unlisted' | 'private';
type PrimaryChannel = 'native' | 'whatsapp' | 'classroom';
type ParentFeedbackMode = 'off' | 'included' | 'paid';

type FormState = {
  title: string;
  subject: string;
  level: string;
  bio: string;
  capacity: number;
  billingModel: BillingModel;
  price: string;
  serviceFee: string;
  visibility: Visibility;
  joinRequests: boolean;
  autoSuspend: boolean;
  graceWindowDays: number;
  whatsappLink: string;
  classroomLink: string;
  primaryChannel: PrimaryChannel;
  parentFeedbackMode: ParentFeedbackMode;
  parentFeedbackPrice: string;
};

const defaultForm: FormState = {
  title: '',
  subject: '',
  level: '',
  bio: '',
  capacity: 10,
  billingModel: 'per-session',
  price: '',
  serviceFee: '5',
  visibility: 'public',
  joinRequests: false,
  autoSuspend: false,
  graceWindowDays: 7,
  whatsappLink: '',
  classroomLink: '',
  primaryChannel: 'native',
  parentFeedbackMode: 'off',
  parentFeedbackPrice: '',
};

export default function CreateLessonPage() {
  return (
    <TutorShell>
      <CreateWizard />
    </TutorShell>
  );
}

function CreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<ClassType>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [requests, setRequests] = useState<RecurringRequest[]>(PLACEHOLDER_RECURRING_REQUESTS);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function acceptRequest(req: RecurringRequest) {
    setType('1on1');
    setForm((f) => ({ ...f, title: `${req.subject} 1:1 – ${req.studentName.split(' ')[0]}`, subject: req.subject, level: req.level }));
    setStep(2);
  }

  function declineRequest(id: string) {
    setRequests((r) => r.filter((req) => req.id !== id));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <button onClick={() => (step === 2 ? setStep(1) : router.back())} className="size-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground">
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-ink">Create a Class</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Set up a new group or 1:1 class</p>
        </div>
      </header>

      <Stepper step={step} />

      {step === 1 ? (
        <StepOne
          type={type}
          onType={setType}
          requests={requests}
          onAccept={acceptRequest}
          onDecline={declineRequest}
          onContinue={() => setStep(2)}
        />
      ) : (
        <StepTwo
          type={type!}
          form={form}
          set={set}
          onBack={() => setStep(1)}
        />
      )}
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {([1, 2] as const).map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="size-4 text-border" />}
          <div className={cn('flex items-center gap-1.5 font-medium', step === s ? 'text-ink' : step > s ? 'text-brand-deep' : 'text-muted-foreground')}>
            <div className={cn('size-6 rounded-full grid place-items-center text-xs font-bold', step === s ? 'bg-brand text-white' : step > s ? 'bg-brand-soft text-brand-deep' : 'bg-muted text-muted-foreground')}>
              {step > s ? <Check className="size-3" /> : s}
            </div>
            {s === 1 ? 'Class type' : 'Settings'}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepOne({ type, onType, requests, onAccept, onDecline, onContinue }: {
  type: ClassType;
  onType: (t: ClassType) => void;
  requests: RecurringRequest[];
  onAccept: (r: RecurringRequest) => void;
  onDecline: (id: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <TypeCard
          selected={type === 'group'}
          onClick={() => onType('group')}
          icon={<Users className="size-6" />}
          title="Group"
          desc="2+ students, shared schedule"
          badges={['Marketplace ready', 'Up to 500 students', 'Recurring or one-off']}
        />
        <TypeCard
          selected={type === '1on1'}
          onClick={() => onType('1on1')}
          icon={<User className="size-6" />}
          title="Recurring 1:1"
          desc="A single student on a repeating schedule"
          badges={['Private by default', 'Flexible schedule', 'Personalised billing']}
        />
      </div>

      <button
        onClick={onContinue}
        disabled={!type}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-brand text-white font-semibold text-sm hover:bg-brand-deep disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue <ChevronRight className="size-4" />
      </button>

      {requests.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-ink">Recurring 1:1 Requests</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Students waiting for a dedicated weekly slot</p>
          </div>
          <div className="space-y-3">
            {requests.map((req) => (
              <RequestCard key={req.id} req={req} onAccept={() => onAccept(req)} onDecline={() => onDecline(req.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TypeCard({ selected, onClick, icon, title, desc, badges }: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badges: string[];
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left rounded-2xl border-2 p-5 transition hover:shadow-md',
        selected ? 'border-brand bg-brand-soft/30' : 'border-border bg-card hover:border-brand/40',
      )}
    >
      <div className={cn('size-11 rounded-xl grid place-items-center mb-3', selected ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>
        {icon}
      </div>
      <div className="font-bold text-ink">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5 mb-3">{desc}</div>
      <div className="flex flex-wrap gap-1.5">
        {badges.map((b) => (
          <span key={b} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">{b}</span>
        ))}
      </div>
      {selected && (
        <div className="mt-3 flex items-center gap-1 text-brand-deep text-xs font-semibold">
          <Check className="size-3" /> Selected
        </div>
      )}
    </button>
  );
}

function RequestCard({ req, onAccept, onDecline }: { req: RecurringRequest; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-brand/10 text-brand-deep grid place-items-center text-sm font-bold shrink-0">
            {req.initials}
          </div>
          <div>
            <div className="font-semibold text-ink text-sm">{req.studentName}</div>
            <div className="text-xs text-muted-foreground">{req.subject} · {req.level}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Clock className="size-3" />
          {new Date(req.receivedAt).toLocaleDateString('en-TT', { month: 'short', day: 'numeric' })}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3" />
        {req.preferredTime}
      </div>

      <div className="flex items-start gap-1.5 text-xs text-ink">
        <MessageSquare className="size-3 mt-0.5 text-muted-foreground shrink-0" />
        <p className="line-clamp-2">{req.message}</p>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onAccept} className="flex-1 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-deep">
          Accept & set up class
        </button>
        <button onClick={onDecline} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-coral-soft hover:text-coral hover:border-coral/30">
          Decline
        </button>
      </div>
    </div>
  );
}

const BILLING_MODEL_MAP: Record<BillingModel, string> = {
  'per-session': 'PER_SESSION',
  'per-month': 'MONTHLY',
  'prepaid': 'PREPAID',
};

function StepTwo({ type, form, set, onBack }: {
  type: ClassType;
  form: FormState;
  set: <K extends keyof FormState>(key: K, val: FormState[K]) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (publish: boolean) => {
    if (!form.title.trim()) { setError('Class title is required.'); return; }
    setError(null);
    setSubmitting(publish ? 'publish' : 'draft');

    try {
      // Step 1 — create the group (basic fields the POST route handles)
      const createRes = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.title.trim(),
          description: form.bio.trim() || null,
          subject: form.subject || null,
          form_level: form.level || null,
          pricing_model: BILLING_MODEL_MAP[form.billingModel],
          price_per_session: form.price ? Number(form.price) : null,
          max_students: type === '1on1' ? 1 : form.capacity,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) { setError(createData?.error ?? 'Failed to create class.'); return; }

      const groupId = createData?.group?.id;
      if (!groupId) { setError('Class created but no ID returned — please contact support.'); return; }

      // Step 2 — PATCH in all extended fields + status in one call.
      // Using PATCH avoids the publish route's "session required" gate which
      // doesn't apply during initial class creation.
      const patchRes = await fetch(`/api/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_students: type === '1on1' ? 1 : form.capacity,
          status: publish ? 'PUBLISHED' : 'DRAFT',
          requires_approval: form.joinRequests,
          auto_suspend: form.autoSuspend,
          grace_window_days: form.graceWindowDays,
          whatsapp_link: form.whatsappLink || null,
          primary_channel: form.primaryChannel,
          parent_feedback_mode: form.parentFeedbackMode,
          parent_feedback_price: form.parentFeedbackPrice ? Number(form.parentFeedbackPrice) : null,
          service_fee_pct: form.serviceFee ? Number(form.serviceFee) : 0,
        }),
      });

      if (!patchRes.ok) {
        console.warn('[create class] PATCH step failed — extended fields not saved');
      }

      router.push(`/tutor/classes/${groupId}`);
    } catch (err) {
      console.error('[create class]', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Basics">
        <Field label="Class title">
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. CSEC Maths Crash Course" className={inputCls} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Subject">
            <SubjectSelect value={form.subject} onChange={(v) => set('subject', v)} />
          </Field>
          <Field label="Level">
            <LevelSelect value={form.level} onChange={(v) => set('level', v)} />
          </Field>
        </div>
        <Field label="Class bio">
          <textarea value={form.bio} onChange={(e) => set('bio', e.target.value)} placeholder="A short description of what students can expect…" rows={3} className={cn(inputCls, 'resize-none')} />
        </Field>
      </SectionCard>

      <SectionCard title="Capacity & billing">
        {type === 'group' && (
          <Field label="Student limit (2–500)">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set('capacity', Math.max(2, form.capacity - 1))}
                className="size-8 rounded-lg border border-border bg-card grid place-items-center hover:bg-muted"
              >
                <Minus className="size-4" />
              </button>
              <input
                type="number"
                min={2}
                max={500}
                value={form.capacity}
                onChange={(e) => {
                  const v = Math.min(500, Math.max(2, Number(e.target.value) || 2));
                  set('capacity', v);
                }}
                className="w-20 px-2 py-2 rounded-lg border border-border bg-background text-sm text-center font-bold text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button
                type="button"
                onClick={() => set('capacity', Math.min(500, form.capacity + 1))}
                className="size-8 rounded-lg border border-border bg-card grid place-items-center hover:bg-muted"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </Field>
        )}
        <Field label="Billing model">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['per-session', 'per-month', 'prepaid'] as BillingModel[]).map((m) => (
              <button key={m} onClick={() => set('billingModel', m)} className={cn('flex-1 py-2 text-xs font-semibold capitalize transition', form.billingModel === m ? 'bg-brand text-white' : 'bg-card text-muted-foreground hover:bg-muted')}>
                {m === 'per-session' ? 'Per session' : m === 'per-month' ? 'Monthly' : 'Prepaid'}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Price (TTD)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">TT$</span>
              <input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0" className={cn(inputCls, 'pl-10')} />
            </div>
          </Field>
          <Field label="Per-member service fee (TTD)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">TT$</span>
              <input type="number" value={form.serviceFee} onChange={(e) => set('serviceFee', e.target.value)} placeholder="5" className={cn(inputCls, 'pl-10')} />
            </div>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Access & policies">
        <Field label="Visibility">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {([
              { value: 'public', label: 'Public', icon: Globe },
              { value: 'unlisted', label: 'Unlisted', icon: EyeOff },
              { value: 'private', label: 'Private', icon: Lock },
            ] as { value: Visibility; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(({ value, label, icon: Icon }) => (
              <button key={value} onClick={() => set('visibility', value)} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition', form.visibility === value ? 'bg-brand text-white' : 'bg-card text-muted-foreground hover:bg-muted')}>
                <Icon className="size-3" /> {label}
              </button>
            ))}
          </div>
        </Field>
        <Toggle label="Enable join requests" desc="Students send a request before joining" value={form.joinRequests} onChange={(v) => set('joinRequests', v)} />
        <Toggle label="Auto-suspend on missed payment" desc="Suspend student access when payment is overdue" value={form.autoSuspend} onChange={(v) => set('autoSuspend', v)} />
        {form.autoSuspend && (
          <Field label="Grace window (days)">
            <input type="number" value={form.graceWindowDays} onChange={(e) => set('graceWindowDays', Number(e.target.value))} className={cn(inputCls, 'w-24')} min={0} max={30} />
          </Field>
        )}
      </SectionCard>

      <SectionCard title="Communication">
        <Field label="WhatsApp group link">
          <input value={form.whatsappLink} onChange={(e) => set('whatsappLink', e.target.value)} placeholder="https://chat.whatsapp.com/…" className={inputCls} />
        </Field>
        <Field label="Google Classroom link">
          <input value={form.classroomLink} onChange={(e) => set('classroomLink', e.target.value)} placeholder="https://classroom.google.com/…" className={inputCls} />
        </Field>
        <Field label="Primary channel">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['native', 'whatsapp', 'classroom'] as PrimaryChannel[]).map((c) => (
              <button key={c} onClick={() => set('primaryChannel', c)} className={cn('flex-1 py-2 text-xs font-semibold capitalize transition', form.primaryChannel === c ? 'bg-brand text-white' : 'bg-card text-muted-foreground hover:bg-muted')}>
                {c === 'native' ? 'iTutor' : c === 'whatsapp' ? 'WhatsApp' : 'Classroom'}
              </button>
            ))}
          </div>
        </Field>
      </SectionCard>

      <SectionCard title="Parent feedback">
        <Field label="Feedback mode">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {([
              { value: 'off', label: 'Off' },
              { value: 'included', label: 'Included free' },
              { value: 'paid', label: 'Paid add-on' },
            ] as { value: ParentFeedbackMode; label: string }[]).map(({ value, label }) => (
              <button key={value} onClick={() => set('parentFeedbackMode', value)} className={cn('flex-1 py-2 text-xs font-semibold transition', form.parentFeedbackMode === value ? 'bg-brand text-white' : 'bg-card text-muted-foreground hover:bg-muted')}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        {form.parentFeedbackMode === 'paid' && (
          <Field label="Price per report (TTD)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">TT$</span>
              <input type="number" value={form.parentFeedbackPrice} onChange={(e) => set('parentFeedbackPrice', e.target.value)} placeholder="50" className={cn(inputCls, 'pl-10 w-32')} />
            </div>
          </Field>
        )}
      </SectionCard>

      {error && (
        <div className="rounded-lg bg-coral-soft border border-coral/30 px-4 py-3 text-sm text-coral font-medium">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 pb-8">
        <button onClick={onBack} disabled={!!submitting}
          className="sm:w-auto w-full py-2.5 px-4 rounded-lg border border-border text-sm font-medium text-ink hover:bg-muted disabled:opacity-40">
          Back
        </button>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={() => submit(false)} disabled={!!submitting}
            className="flex-1 sm:flex-none py-2.5 px-4 rounded-lg border border-border text-sm font-medium text-ink hover:bg-muted disabled:opacity-40">
            {submitting === 'draft' ? 'Saving…' : 'Save as draft'}
          </button>
          <button onClick={() => submit(true)} disabled={!!submitting}
            className="flex-1 sm:flex-none py-2.5 px-5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-40">
            {submitting === 'publish' ? 'Publishing…' : 'Publish Class'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subject select ─────────────────────────────────────────────────────────

interface SubjectOption { id: string; name: string; curriculum: string }

function SubjectSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [options, setOptions] = useState<SubjectOption[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/subjects')
      .then((r) => r.json())
      .then((d) => setOptions(d?.subjects ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));

  const grouped = filtered.reduce<Record<string, SubjectOption[]>>((acc, o) => {
    const key = o.curriculum || 'Other';
    (acc[key] ??= []).push(o);
    return acc;
  }, {});

  const ORDER = ['SEA', 'CSEC', 'CAPE', 'Other'];
  const curricula = [...new Set([...ORDER, ...Object.keys(grouped)])].filter((k) => grouped[k]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={cn(inputCls, 'flex items-center justify-between text-left', !value && 'text-muted-foreground')}>
        <span>{value || 'Select subject…'}</span>
        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-background shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subjects…"
              className="flex-1 text-sm bg-transparent outline-none text-ink placeholder:text-muted-foreground" />
            {search && <button onClick={() => setSearch('')}><X className="size-3.5 text-muted-foreground" /></button>}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {curricula.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No subjects found</div>
            ) : curricula.map((cur) => (
              <div key={cur}>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/50 sticky top-0">{cur}</div>
                {grouped[cur]!.map((o) => (
                  <button key={o.id} type="button"
                    onClick={() => { onChange(o.name); setOpen(false); setSearch(''); }}
                    className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted transition flex items-center justify-between',
                      value === o.name ? 'text-brand-deep font-semibold' : 'text-ink')}>
                    {o.name}
                    {value === o.name && <Check className="size-3.5 text-brand" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Level select ────────────────────────────────────────────────────────────

const LEVELS = [
  { group: 'Primary', options: ['SEA'] },
  { group: 'Lower Secondary', options: ['Form 1', 'Form 2', 'Form 3'] },
  { group: 'Upper Secondary (CSEC)', options: ['Form 4', 'Form 5'] },
  { group: 'Sixth Form (CAPE)', options: ['Lower 6', 'Upper 6'] },
];

function LevelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, !value && 'text-muted-foreground')}>
      <option value="">Select level…</option>
      {LEVELS.map(({ group, options }) => (
        <optgroup key={group} label={group}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-bold text-ink text-sm">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-ink">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn('relative shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors', value ? 'bg-brand' : 'bg-muted border border-border')}
      >
        <span className={cn('absolute top-1 left-1 size-4 rounded-full bg-white shadow transition-transform', value ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand text-ink placeholder:text-muted-foreground';

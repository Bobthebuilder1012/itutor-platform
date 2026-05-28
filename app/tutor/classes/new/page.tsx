'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Users, User as UserIcon, ChevronRight, Check, X,
  Globe, Lock, Eye, MessageSquare, Sparkles, DollarSign, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type DbSubject = { id: string; name: string; label: string; curriculum: string };

const LEVEL_OPTIONS = [
  { value: 'SEA',    label: 'SEA' },
  { value: 'FORM_1', label: 'Form 1' },
  { value: 'FORM_2', label: 'Form 2' },
  { value: 'FORM_3', label: 'Form 3' },
  { value: 'FORM_4', label: 'Form 4' },
  { value: 'FORM_5', label: 'Form 5' },
  { value: 'CAPE',   label: 'CAPE' },
];

type ClassType = 'group' | 'recurring-1on1';
type BillingModel = 'per-session' | 'per-month' | 'prepaid';
type Visibility = 'public' | 'unlisted' | 'private';
type PrimaryChannel = 'native' | 'whatsapp' | 'classroom';
type FeedbackMode = 'off' | 'included' | 'paid';

export default function CreateLessonPage() {
  return (
    <TutorShell>
      <CreateClassContent />
    </TutorShell>
  );
}

function CreateClassContent() {
  const router = useRouter();
  const { profile } = useProfile();
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<ClassType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Subject search state
  const [allSubjects, setAllSubjects] = useState<DbSubject[]>([]);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const subjectRef = useRef<HTMLDivElement>(null);

  // Step 2 fields
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [bio, setBio] = useState('');
  const [studentLimit, setStudentLimit] = useState(8);
  const [billingModel, setBillingModel] = useState<BillingModel>('per-session');
  const [price, setPrice] = useState(120);
  const [memberFee, setMemberFee] = useState(5);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [joinRequests, setJoinRequests] = useState(false);
  const [autoSuspend, setAutoSuspend] = useState(true);
  const [graceDays, setGraceDays] = useState(7);
  const [whatsapp, setWhatsapp] = useState('');
  const [classroom, setClassroom] = useState('');
  const [primary, setPrimary] = useState<PrimaryChannel>('native');
  const [feedback, setFeedback] = useState<FeedbackMode>('off');
  const [feedbackPrice, setFeedbackPrice] = useState(50);

  useEffect(() => {
    supabase
      .from('subjects')
      .select('id, name, label, curriculum')
      .order('curriculum', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => setAllSubjects((data ?? []).map((s: any) => ({ id: s.id, name: s.name, label: s.label || s.name, curriculum: s.curriculum || '' }))));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (subjectRef.current && !subjectRef.current.contains(e.target as Node)) {
        setSubjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredSubjects = allSubjects.filter((s) =>
    subjectSearch === '' || s.label.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  const selectSubject = (label: string) => {
    setSubject(label);
    setSubjectSearch(label);
    setSubjectDropdownOpen(false);
  };

  const clearSubject = () => {
    setSubject('');
    setSubjectSearch('');
    setSubjectDropdownOpen(false);
  };

  const handlePublish = async () => {
    if (!profile?.id || !title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorId: profile.id,
          name: title,
          subject,
          formLevel: level,
          form_level: level,
          description: bio,
          maxStudents: type === 'recurring-1on1' ? 1 : studentLimit,
          pricePerSession: price,
          isPublic: visibility === 'public',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/tutor/classes/${data.group?.id ?? data.id ?? ''}`);
      } else {
        router.push('/tutor/classes');
      }
    } catch {
      router.push('/tutor/classes');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/tutor/classes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> All Classes
      </Link>

      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Create a Class</h1>
        <p className="text-sm text-muted-foreground mt-1">Set up a new group or recurring 1:1.</p>
      </header>

      <Stepper step={step} />

      {step === 1 && (
        <>
          <section className="grid sm:grid-cols-2 gap-4">
            <TypeCard
              active={type === 'group'}
              onClick={() => setType('group')}
              icon={Users}
              title="Group"
              caption="2+ students, shared schedule, recurring or one-off."
              badges={['Marketplace ready', 'Roster & payments grid', 'Stream + analytics']}
            />
            <TypeCard
              active={type === 'recurring-1on1'}
              onClick={() => { setType('recurring-1on1'); setStudentLimit(1); }}
              icon={UserIcon}
              title="Recurring 1:1"
              caption="A single student on a repeating schedule."
              badges={['Private by default', 'No scarcity UI', 'Hides analytics tab']}
            />
          </section>

          <div className="flex justify-end">
            <button disabled={!type} onClick={() => setStep(2)}
              className={cn('inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold',
                type ? 'bg-brand text-white hover:bg-brand/90' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
              Continue <ChevronRight className="size-4" />
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <Card title="Basics">
            <Field label="Class title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CSEC Maths Crash Course"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subject">
                <div className="relative" ref={subjectRef}>
                  <input
                    value={subjectSearch}
                    onChange={(e) => { setSubjectSearch(e.target.value); setSubjectDropdownOpen(true); setSubject(''); }}
                    onFocus={() => setSubjectDropdownOpen(true)}
                    placeholder="Search subjects…"
                    className="w-full px-3 py-2 pr-8 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  {subject && (
                    <button type="button" onClick={clearSubject} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink">
                      <X className="size-3.5" />
                    </button>
                  )}
                  {subjectDropdownOpen && filteredSubjects.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredSubjects.map((s) => (
                        <button key={s.id} type="button" onClick={() => selectSubject(s.label)}
                          className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors',
                            subject === s.label && 'bg-brand/10 text-brand-deep font-medium')}>
                          <span className="font-medium">{s.label}</span>
                          {s.curriculum && <span className="text-xs text-muted-foreground ml-1.5">· {s.curriculum}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {subjectDropdownOpen && subjectSearch.length > 0 && filteredSubjects.length === 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-lg shadow-lg p-3 text-sm text-muted-foreground">
                      No subjects found.
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Level">
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand appearance-none"
                >
                  <option value="">Select level…</option>
                  {LEVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Class bio">
              <textarea value={bio} onChange={(e) => setBio(e.target.value)}
                className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </Field>
          </Card>

          <Card title="Capacity & billing">
            {type === 'group' && (
              <Field label="Student limit">
                <div className="inline-flex items-center gap-2">
                  <button onClick={() => setStudentLimit(Math.max(2, studentLimit - 1))} className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted">−</button>
                  <input type="number" value={studentLimit} onChange={(e) => setStudentLimit(Math.max(2, Math.min(500, Number(e.target.value))))}
                    className="w-20 text-center px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                  <button onClick={() => setStudentLimit(Math.min(500, studentLimit + 1))} className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted">+</button>
                </div>
              </Field>
            )}
            <Field label="Billing model">
              <div className="grid grid-cols-3 gap-2">
                {(['per-session', 'per-month', 'prepaid'] as BillingModel[]).map((b) => (
                  <button key={b} onClick={() => setBillingModel(b)}
                    className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize',
                      billingModel === b ? 'bg-brand/10 border-brand text-brand-deep' : 'border-border bg-background text-muted-foreground hover:text-ink')}>
                    {b.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (TTD)">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
              </Field>
              <Field label="Per-member service fee (TTD)">
                <input type="number" value={memberFee} onChange={(e) => setMemberFee(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </Field>
            </div>
          </Card>

          <Card title="Access & policies">
            <Field label="Visibility">
              <div className="grid grid-cols-3 gap-2">
                {(['public', 'unlisted', 'private'] as Visibility[]).map((v) => (
                  <button key={v} onClick={() => setVisibility(v)}
                    className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize inline-flex items-center justify-center gap-1.5',
                      visibility === v ? 'bg-brand/10 border-brand text-brand-deep' : 'border-border bg-background text-muted-foreground hover:text-ink')}>
                    {v === 'public' ? <Globe className="size-3.5" /> : v === 'private' ? <Lock className="size-3.5" /> : <Eye className="size-3.5" />} {v}
                  </button>
                ))}
              </div>
            </Field>
            <Toggle label="Enable join requests" hint="Members must request approval before joining." value={joinRequests} onChange={setJoinRequests} />
            <Toggle label="Auto-suspend on overdue payment" value={autoSuspend} onChange={setAutoSuspend} />
            {autoSuspend && (
              <Field label="Grace window (days)">
                <input type="number" value={graceDays} onChange={(e) => setGraceDays(Number(e.target.value))}
                  className="w-32 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </Field>
            )}
          </Card>

          <Card title="Communication">
            <Field label="WhatsApp group link">
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="https://chat.whatsapp.com/…"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </Field>
            <Field label="Google Classroom link">
              <input value={classroom} onChange={(e) => setClassroom(e.target.value)} placeholder="https://classroom.google.com/c/…"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </Field>
            <Field label="Primary channel">
              <div className="grid grid-cols-3 gap-2">
                {(['native', 'whatsapp', 'classroom'] as PrimaryChannel[]).map((c) => (
                  <button key={c} onClick={() => setPrimary(c)}
                    className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize inline-flex items-center justify-center gap-1.5',
                      primary === c ? 'bg-brand/10 border-brand text-brand-deep' : 'border-border bg-background text-muted-foreground hover:text-ink')}>
                    {c === 'whatsapp' ? <MessageSquare className="size-3.5" /> : c === 'classroom' ? <Globe className="size-3.5" /> : <Sparkles className="size-3.5" />}
                    {c === 'native' ? 'iTutor' : c}
                  </button>
                ))}
              </div>
            </Field>
          </Card>

          <Card title="Parent feedback">
            <Field label="Mode" hint="AI drafts a monthly report. You review and approve before send.">
              <div className="grid grid-cols-3 gap-2">
                {(['off', 'included', 'paid'] as FeedbackMode[]).map((m) => (
                  <button key={m} onClick={() => setFeedback(m)}
                    className={cn('px-3 py-2 rounded-lg border text-xs font-semibold',
                      feedback === m ? 'bg-brand/10 border-brand text-brand-deep' : 'border-border bg-background text-muted-foreground hover:text-ink')}>
                    {m === 'included' ? 'Included free' : m === 'paid' ? 'Paid add-on' : 'Off'}
                  </button>
                ))}
              </div>
            </Field>
            {feedback === 'paid' && (
              <Field label="Price per report (TTD)">
                <input type="number" value={feedbackPrice} onChange={(e) => setFeedbackPrice(Number(e.target.value))}
                  className="w-32 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </Field>
            )}
          </Card>

          <div className="flex justify-between items-center">
            <button onClick={() => setStep(1)} className="text-sm font-semibold text-muted-foreground hover:text-ink">← Back</button>
            <div className="flex items-center gap-2">
              <button onClick={() => router.push('/tutor/classes')} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted">
                Save as draft
              </button>
              <button onClick={handlePublish} disabled={submitting || !title.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-60">
                <Check className="size-4" /> {submitting ? 'Publishing…' : 'Publish Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      {([1, 2] as const).map((n, i) => (
        <div key={n} className="flex items-center gap-3">
          <div className={cn('size-7 rounded-full grid place-items-center text-xs font-bold',
            step >= n ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>
            {step > n ? <Check className="size-3.5" /> : n}
          </div>
          <span className={cn('font-semibold', step === n ? 'text-ink' : 'text-muted-foreground')}>
            {n === 1 ? 'Choose type' : 'Settings'}
          </span>
          {i === 0 && <ChevronRight className="size-4 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

function TypeCard({ active, onClick, icon: Icon, title, caption, badges }: {
  active: boolean; onClick: () => void; icon: any; title: string; caption: string; badges: string[];
}) {
  return (
    <button onClick={onClick}
      className={cn('text-left rounded-2xl bg-card border p-6 transition', active ? 'border-brand ring-2 ring-brand/30' : 'border-border hover:border-brand')}>
      <div className={cn('size-12 rounded-xl grid place-items-center mb-3', active ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>
        <Icon className="size-5" />
      </div>
      <div className="font-bold text-ink text-lg">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{caption}</div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {badges.map((b) => <span key={b} className="text-[10px] font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">{b}</span>)}
      </div>
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
      <h3 className="font-bold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-ink">{label}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5 mb-2">{hint}</div>}
      <div className={cn(!hint && 'mt-2')}>{children}</div>
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
      <div className="flex-1">
        <div className="text-sm font-semibold text-ink">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <button onClick={() => onChange(!value)} className={cn('w-11 h-6 rounded-full p-0.5 transition shrink-0', value ? 'bg-brand' : 'bg-muted')}>
        <span className={cn('block size-5 rounded-full bg-white shadow transition', value && 'translate-x-5')} />
      </button>
    </div>
  );
}

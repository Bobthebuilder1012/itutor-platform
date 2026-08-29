'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Users, User as UserIcon, ChevronRight, Check, X,
  Globe, Lock, DollarSign, Info, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';
import { LEVEL_LABELS } from '@/lib/utils/formatLevel';
import InPersonSection, { type InPersonDraft } from '@/components/tutor/classes/InPersonSection';

type DbSubject = { id: string; name: string; label: string; curriculum: string };

const LEVEL_OPTIONS = Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }));

type ClassType = 'group' | 'recurring-1on1';
type Visibility = 'public' | 'private';

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
  const [submitting, setSubmitting] = useState<'PUBLISHED' | 'DRAFT' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [allSubjects, setAllSubjects] = useState<DbSubject[]>([]);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const subjectRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [bio, setBio] = useState('');
  const [studentLimit, setStudentLimit] = useState(8);
  const [price, setPrice] = useState(120);
  // Required by /api/groups — billing recurs until this date, so a class
  // without one would charge students forever.
  const [endDate, setEndDate] = useState('');
  const [memberFee, setMemberFee] = useState(0);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [joinRequests, setJoinRequests] = useState(false);
  const [autoSuspend, setAutoSuspend] = useState(true);
  const [graceDays, setGraceDays] = useState(7);
  const [whatsapp, setWhatsapp] = useState('');
  const [classroom, setClassroom] = useState('');
  // In person (migration 242). Only offered for a group class — a recurring
  // 1:1 has exactly one student, and the seat-capacity split this section
  // manages ("N online seats, N physical seats") has no meaning for a class
  // of one. This page never asked for a venue at all before, which is the gap
  // this closes: CreateGroupModal (the older /groups creation flow) got it,
  // this one — the one "Create a Class" actually links to — did not.
  const [inPerson, setInPerson] = useState<InPersonDraft>({
    classFormat: 'online',
    venueId: null,
    venueVisibility: 'after_enrolment',
    maxStudentsOnline: null,
    maxStudentsPhysical: null,
    priceOnlineTtd: null,
    pricePhysicalTtd: null,
    acceptsCash: false,
  });

  useEffect(() => {
    supabase
      .from('subjects')
      .select('id, name, label, curriculum')
      .order('curriculum', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => setAllSubjects((data ?? []).map((s: any) => ({ id: s.id, name: s.name, label: s.label || s.name, curriculum: s.curriculum || '' }))));
  }, []);

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

  /**
   * `status` decides whether this publishes or saves a draft.
   *
   * "Save as draft" used to call router.push and nothing else, so it discarded
   * everything typed — the endpoint had no draft path to call (groups.status is
   * NOT NULL DEFAULT 'PUBLISHED' and no insert set it). Both buttons now go
   * through the same request; only the status differs.
   *
   * A draft still needs a name and an end date, because the endpoint requires
   * both of every new class. Relaxing that for drafts would create rows that
   * EndDateGate then blocks, which is the trap the duplicate-end-date bug came
   * from.
   */
  const handleSubmit = async (status: 'PUBLISHED' | 'DRAFT') => {
    if (!profile?.id || !title.trim() || !endDate) return;
    // A room is required once the format says the class meets in one. Checked
    // here rather than left to the API's 400, because the venue picker is
    // several fields above the submit button and a generic server error would
    // leave the tutor hunting for what's missing.
    if (type === 'group' && inPerson.classFormat !== 'online' && !inPerson.venueId) {
      setSaveError('Choose a venue before setting this class to meet in person.');
      return;
    }
    setSubmitting(status);
    setSaveError(null);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          tutorId: profile.id,
          name: title,
          subject,
          formLevel: level,
          form_level: level,
          description: bio,
          maxStudents: type === 'recurring-1on1' ? 1 : studentLimit,
          price_monthly: price,
          end_date: endDate,
          member_service_fee: memberFee,
          pricing_model: 'MONTHLY',
          isPublic: visibility === 'public',
          require_join_requests: joinRequests,
          auto_suspend_missed_payment: autoSuspend,
          grace_period_days: graceDays,
          whatsapp_url: whatsapp,
          google_classroom_link: classroom,
          // In person (migration 242) — group classes only, see the state
          // comment above for why a recurring 1:1 stays plain 'online'.
          class_format: type === 'group' ? inPerson.classFormat : 'online',
          venue_id:
            type === 'group' && inPerson.classFormat !== 'online' ? inPerson.venueId : null,
          venue_visibility: inPerson.venueVisibility,
          max_students_online: type === 'group' ? inPerson.maxStudentsOnline : null,
          max_students_physical: type === 'group' ? inPerson.maxStudentsPhysical : null,
          price_online_ttd: type === 'group' ? inPerson.priceOnlineTtd : null,
          price_physical_ttd: type === 'group' ? inPerson.pricePhysicalTtd : null,
          accepts_cash:
            type === 'group' && inPerson.classFormat !== 'online' ? inPerson.acceptsCash : false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/tutor/classes/${data.group?.id ?? data.id ?? ''}`);
        return;
      }
      // Previously this navigated to /tutor/classes on failure, so a rejected
      // save looked exactly like a successful one that had vanished — the tutor
      // lost the form and was told nothing. The endpoint's messages are written
      // for a person ("An end date is required..."), so show them.
      const json = await res.json().catch(() => ({}));
      setSaveError(json.error ?? 'We could not save this class — please try again.');
    } catch {
      setSaveError('We could not save this class — please check your connection and try again.');
    } finally {
      setSubmitting(null);
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
              caption="2+ students, shared schedule, recurring sessions."
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
                placeholder="Tell students what this class covers, who it's for, and what they'll achieve…"
                className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </Field>
          </Card>

          <Card title="Capacity & pricing">
            {type === 'group' && (
              <Field label="Student limit" hint="Min 2 · Max 500.">
                <div className="inline-flex items-center gap-2">
                  <button onClick={() => setStudentLimit(Math.max(2, studentLimit - 1))} className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted text-lg font-semibold">−</button>
                  <input type="number" value={studentLimit} onChange={(e) => setStudentLimit(Math.max(2, Math.min(500, Number(e.target.value))))}
                    className="w-20 text-center px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                  <button onClick={() => setStudentLimit(Math.min(500, studentLimit + 1))} className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted text-lg font-semibold">+</button>
                </div>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly price (TTD)">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
              </Field>
              <Field
                label="Per-member service fee (TTD)"
                infoTitle="Service fee"
                infoBlurb="A small flat fee added to each member's bill — useful to cover materials, platform costs, or admin overhead."
              >
                <input type="number" value={memberFee} onChange={(e) => setMemberFee(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </Field>
            </div>
            <Field
              label="Class end date"
              hint="Billing stops after this date. Every class needs one — students are charged monthly until it passes."
            >
              <input
                type="date"
                value={endDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </Field>
          </Card>

          {type === 'group' && (
            <Card title="Where does this meet?">
              <p className="-mt-2 text-xs text-muted-foreground">
                You can change this later. Everyone gets a meeting link either way —
                an in-person student can still join online when they need to.
              </p>
              <InPersonSection
                draft={inPerson}
                onChange={(patch: Partial<InPersonDraft>) =>
                  setInPerson((prev) => ({ ...prev, ...patch }))
                }
                // A class being created has nobody in it yet, so there is no
                // seat floor to respect.
                enrolledOnline={0}
                enrolledPhysical={0}
              />
            </Card>
          )}

          <Card title="Access & policies">
            <Field label="Visibility" hint="Public classes appear in the marketplace. Private classes are invite-only.">
              <div className="grid grid-cols-2 gap-2">
                {(['public', 'private'] as Visibility[]).map((v) => (
                  <button key={v} onClick={() => setVisibility(v)}
                    className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize inline-flex items-center justify-center gap-1.5',
                      visibility === v ? 'bg-brand/10 border-brand text-brand-deep' : 'border-border bg-background text-muted-foreground hover:text-ink')}>
                    {v === 'public' ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />} {v}
                  </button>
                ))}
              </div>
            </Field>
            <Toggle
              label="Enable join requests"
              hint="Students must request approval before joining."
              value={joinRequests}
              onChange={setJoinRequests}
            />
            <Toggle
              label="Auto-suspend on missed payment"
              hint="Automatically suspend access when a payment is overdue."
              value={autoSuspend}
              onChange={setAutoSuspend}
            />
            {autoSuspend && (
              <Field label="Grace window (days)" infoTitle="Grace period" infoBlurb="How many days after a missed payment before access is suspended. Gives students time to pay without being cut off immediately.">
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
          </Card>

          <Card title="Parent feedback">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">Monthly progress reports for parents</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Coming Soon</span>
            </div>
            <p className="text-xs text-muted-foreground">AI-drafted monthly reports reviewed and approved by you before being sent to parents. Available soon.</p>
          </Card>

          {/*
            * Stated here because this form never asks for a schedule — it is set
            * afterwards, on the class page. Publishing therefore does NOT put the
            * class on the marketplace on its own, and a tutor who is not told that
            * reasonably assumes it did. On production 18 of 38 published classes
            * have no schedule, which is what this gap produces.
            */}
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-amber-800">
              <span className="font-semibold">One more step after this.</span> A class only appears
              on the marketplace once it has a weekly schedule, and you add that on the class page
              next. Until then students and parents can&rsquo;t find or enrol in it.
            </p>
          </div>

          {saveError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm text-rose-800">{saveError}</p>
            </div>
          )}

          <div className="flex justify-between items-center">
            <button onClick={() => setStep(1)} className="text-sm font-semibold text-muted-foreground hover:text-ink">← Back</button>
            <div className="flex items-center gap-2">
              <button onClick={() => handleSubmit('DRAFT')} disabled={!!submitting || !title.trim() || !endDate}
                className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted disabled:opacity-60">
                {submitting === 'DRAFT' ? 'Saving…' : 'Save as draft'}
              </button>
              <button onClick={() => handleSubmit('PUBLISHED')} disabled={!!submitting || !title.trim() || !endDate}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-60">
                <Check className="size-4" /> {submitting === 'PUBLISHED' ? 'Publishing…' : 'Publish Class'}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-right -mt-3">
            A draft is saved but not listed. You can publish it from the class page.
          </p>
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

function Field({ label, hint, infoTitle, infoBlurb, children }: {
  label: string; hint?: string; infoTitle?: string; infoBlurb?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-ink inline-flex items-center gap-1.5 mb-1">
        {label}
        {infoTitle && infoBlurb && <InfoPop title={infoTitle} blurb={infoBlurb} />}
      </div>
      {hint && <div className="text-xs text-muted-foreground mb-2">{hint}</div>}
      <div>{children}</div>
    </div>
  );
}

function InfoPop({ title, blurb }: { title: string; blurb: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="size-4 grid place-items-center rounded-full text-muted-foreground hover:text-brand-deep"
        aria-label={`About ${title}`}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span className="absolute z-20 left-1/2 -translate-x-1/2 top-6 w-56 rounded-lg border border-border bg-background shadow-pop p-3 text-left">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-ink">{title}</span>
          <span className="block text-xs text-muted-foreground mt-1 font-normal normal-case">{blurb}</span>
        </span>
      )}
    </span>
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

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GraduationCap, FileText, Calendar, Clock, Check, AlertCircle, X, BookOpen, ChevronRight, Trash2, ClipboardCheck, MessageSquare, CreditCard, Ban } from 'lucide-react';
import ChildMessageHistory from '@/components/parent/ChildMessageHistory';
import ChildBillingControls from '@/components/parent/ChildBillingControls';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import ParentShell from '@/components/parent/ParentShell';

type Enrollment = { groupId: string; name: string; subject: string | null; status: string; joinedAt: string | null };
type Booking = { id: string; tutorName: string; subject: string | null; status: string; start: string | null; priceTtd: number | null; durationMinutes: number | null; createdAt: string };
type FeedbackReport = { id: string; month: string; tutorName: string; classTitle: string; body: string; deliveredAt: string; attendance: string };
// present is kept for anything still reading it; status is the §6 model —
// attended | late | absent | cancelled | excluded. `excluded` means the tutor
// never started the class, so the session counts for nobody.
type AttStatus = 'attended' | 'late' | 'absent' | 'cancelled' | 'excluded';
type AttRow = {
  key: string;
  type: '1:1' | 'group';
  label: string;
  start: string;
  present: boolean;
  status?: AttStatus | null;
  lateMinutes?: number | null;
};

/** One place for the vocabulary. §6 keeps it character-identical across the
 *  parent, student and tutor surfaces, so it is not re-worded per screen. */
const ATT_STATUS: Record<AttStatus, { label: string; icon: typeof Check; chip: string; text: string }> = {
  attended:  { label: 'Attended',  icon: Check,          chip: 'bg-brand-soft text-brand-deep',      text: 'text-brand-deep' },
  late:      { label: 'Late',      icon: Clock,          chip: 'bg-amber-100 text-amber-700',        text: 'text-amber-700' },
  absent:    { label: 'Absent',    icon: X,              chip: 'bg-rose-100 text-rose-600',          text: 'text-rose-600' },
  cancelled: { label: 'Cancelled', icon: Ban,            chip: 'bg-muted text-muted-foreground',     text: 'text-muted-foreground' },
  excluded:  { label: 'Didn’t run', icon: Ban,           chip: 'bg-muted text-muted-foreground',     text: 'text-muted-foreground' },
};

function Tally({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <strong className={cn('tabular-nums', tone)}>{n}</strong> {label}
    </span>
  );
}
// The first three are the original shape, kept so nothing else breaks. The rest
// is what the §6 helper actually produces — rateLabel included, so the rate is
// never recomputed on a surface and never printed without its denominator.
type AttSummary = {
  present: number;
  absent: number;
  total: number;
  attended?: number;
  late?: number;
  cancelled?: number;
  excluded?: number;
  rate?: number | null;
  counted?: number;
  rateLabel?: string;
};

export default function ChildDetailPage() {
  return <ParentShell><ChildContent /></ParentShell>;
}

function ChildContent() {
  const { childId } = useParams<{ childId: string }>();
  const router = useRouter();
  const { profile } = useProfile();
  // Progress is gone from child configuration: feedback visibility now lives on
  // the Feedback page, which carries a child selector so a parent switches
  // students without leaving the page. Keeping a per-child copy would have meant
  // two places to request feedback and two places for the monthly quota to be
  // shown, which is how the two drift apart.
  const [tab, setTab] = useState<'overview' | 'classes' | 'attendance' | 'messages' | 'billing'>('overview');
  const [childName, setChildName] = useState('');
  const [initials, setInitials] = useState('');
  const [hue, setHue] = useState(145);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [feedback, setFeedback] = useState<FeedbackReport[]>([]);
  const [attendance, setAttendance] = useState<AttRow[]>([]);
  const [attSummary, setAttSummary] = useState<AttSummary | null>(null);
  const [attLoaded, setAttLoaded] = useState(false);
  const [attLoading, setAttLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openReport, setOpenReport] = useState<FeedbackReport | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  useEffect(() => {
    if (!childId) return;
    (async () => {
      try {
        // Server-side: the child's classes/bookings are RLS-scoped to the child,
        // so the parent must read them via the service-client overview API.
        const res = await fetch(`/api/parent/children/${childId}/overview`, { cache: 'no-store' });
        const data = await res.json();
        if (res.ok) {
          const name = data.child?.name || 'Child';
          setChildName(name);
          setInitials(name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase());
          setHue([145, 200, 30, 280, 350][name.charCodeAt(0) % 5]);
          setEnrollments(data.enrollments ?? []);
          setBookings(data.bookings ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [childId]);

  // Attendance is lazy-loaded the first time the tab is opened.
  useEffect(() => {
    // Overview shows the rate too, so it loads there as well — otherwise the
    // default tab reads "Open to load" where a figure belongs.
    if ((tab !== 'attendance' && tab !== 'overview') || attLoaded || attLoading || !childId) return;
    setAttLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/parent/children/${childId}/attendance`, { cache: 'no-store' });
        const data = await res.json();
        if (res.ok) { setAttendance(data.attendance ?? []); setAttSummary(data.summary ?? null); }
      } finally {
        setAttLoaded(true);
        setAttLoading(false);
      }
    })();
  }, [tab, attLoaded, attLoading, childId]);

  const activeCount = enrollments.filter(e => ['approved','active'].includes(e.status)).length;

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch('/api/parent/remove-child', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId }),
      });
      if (res.ok) router.push('/parent/dashboard');
    } catch { /* silent */ }
    finally { setRemoving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/parent/delete-child-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId }),
      });
      if (res.ok) router.push('/parent/dashboard');
    } catch { /* silent */ }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-6">
      <Link href="/parent/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> All children
      </Link>

      <header className="rounded-2xl bg-background border border-border p-5 flex items-center gap-4">
        <div className="size-16 rounded-full grid place-items-center font-bold text-ink shrink-0 text-xl"
          style={{ background: `oklch(0.85 0.1 ${hue})` }}>{initials}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-ink">{childName}</h1>
          <div className="text-sm text-muted-foreground mt-0.5">{activeCount} active class{activeCount !== 1 ? 'es' : ''}</div>
        </div>
      </header>


      {/* Scrolls rather than wraps on a phone: six tabs will not fit at 390px,
          and a wrapped tab strip pushes the content below the fold. */}
      <div className="-mx-1 flex gap-1 overflow-x-auto p-1 rounded-2xl bg-muted sm:inline-flex sm:mx-0">
        {/* The kit's tab set, in its order: Overview / Progress / Schedule /
            Classes / Billing / Messages. This previously kept four pre-existing
            tabs and bolted two on, which is where it drifted. Progress and
            Schedule are the kit's names for what was called Feedback and
            Attendance; Bookings folded into Overview, since pending requests are
            something a parent acts on at account level (Approvals) and only
            needs to SEE here. */}
        {([
          { id: 'overview' as const, label: 'Overview', icon: BookOpen },
          { id: 'attendance' as const, label: 'Schedule', icon: ClipboardCheck },
          { id: 'classes' as const, label: 'Classes', icon: GraduationCap },
          { id: 'messages' as const, label: 'Messages', icon: MessageSquare },
          { id: 'billing' as const, label: 'Billing', icon: CreditCard },
        ]).map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('inline-flex shrink-0 items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold transition',
                tab === t.id ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}>
              <Icon className="size-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2].map(i=><div key={i} className="h-32 rounded-2xl bg-muted animate-pulse"/>)}</div>
      ) : tab === 'overview' ? (
        /* The kit's Overview: next class, then what a parent glances at — the
           attendance figure and the most recent feedback — with the pending
           requests that used to have their own tab folded in. */
        <div className="space-y-4">
          <OverviewTab
            childName={childName}
            enrollments={enrollments}
            bookings={bookings}
            summary={attSummary}
            feedback={feedback}
            onOpenReport={setOpenReport}
            onGoTo={setTab}
          />
        </div>
      ) : tab === 'classes' ? (
        <ClassesTab enrollments={enrollments} childId={childId} />
      ) : tab === 'attendance' ? (
        <AttendanceTab rows={attendance} summary={attSummary} loading={attLoading} />
      ) : tab === 'messages' ? (
        /* §9.4: read-only, no composer, two-way disclosure. */
        <ChildMessageHistory childId={childId} childName={childName} />
      ) : (
        /* The per-child money controls, beside that child's classes rather than
           only in Settings — a parent looking at one child's spend is already
           here. */
        <ChildBillingControls childId={childId} childName={childName} />
      )}

      {openReport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setOpenReport(null)}>
          <div className="bg-background w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <header className="sticky top-0 bg-background border-b border-border px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Monthly report</div>
                <div className="font-bold text-ink">{openReport.month} · {openReport.classTitle}</div>
              </div>
              <button onClick={() => setOpenReport(null)} className="size-8 rounded-full hover:bg-muted grid place-items-center"><X className="size-4"/></button>
            </header>
            <div className="p-6 space-y-4">
              <div className="text-sm text-muted-foreground">From <span className="font-semibold text-ink">{openReport.tutorName}</span></div>
              <p className="text-[15px] leading-relaxed text-ink whitespace-pre-wrap">{openReport.body}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Danger zone ─────────────────────────────── */}
      <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 space-y-4">
        <div>
          <h2 className="font-bold text-rose-900 text-sm">Danger zone</h2>
          <p className="text-xs text-rose-700 mt-0.5">These actions cannot be undone. Please be certain before proceeding.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Remove link */}
          <div className="rounded-xl border border-rose-200 bg-white p-4 space-y-2">
            <div className="font-semibold text-ink text-sm">Remove from my account</div>
            <p className="text-xs text-muted-foreground">Unlinks {childName} from your parent account. Their student account and all class history stays intact — they can still log in independently.</p>
            <button onClick={() => setRemoveOpen(true)}
              className="mt-1 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 text-xs font-semibold hover:bg-rose-50 transition">
              Remove child
            </button>
          </div>
          {/* Delete account */}
          <div className="rounded-xl border border-rose-300 bg-white p-4 space-y-2">
            <div className="font-semibold text-rose-800 text-sm">Delete student account</div>
            <p className="text-xs text-muted-foreground">Permanently deletes {childName}'s iTutor account and all associated data. This cannot be undone.</p>
            <button onClick={() => { setDeleteOpen(true); setConfirmName(''); }}
              className="mt-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition">
              Delete account
            </button>
          </div>
        </div>
      </section>

      {/* Remove confirm */}
      {removeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setRemoveOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-background border border-border shadow-xl p-6 space-y-4">
            <div className="font-bold text-ink text-lg">Remove {childName}?</div>
            <p className="text-sm text-muted-foreground">
              This removes the link between your parent account and {childName}'s student account. Their account and class history will stay intact — they can still log in independently.
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setRemoveOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={handleRemove} disabled={removing}
                className="flex-1 px-4 py-2.5 rounded-xl border border-rose-300 text-rose-700 text-sm font-semibold hover:bg-rose-50 disabled:opacity-50">
                {removing ? 'Removing…' : 'Remove child'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account confirm — requires typing the child's name */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDeleteOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-background border border-border shadow-xl p-6 space-y-4">
            <div className="font-bold text-ink text-lg">Permanently delete account?</div>
            <p className="text-sm text-muted-foreground">
              This will permanently delete <strong>{childName}</strong>'s student account, all class memberships, and their login. <strong>This cannot be undone.</strong>
            </p>
            <div>
              <label className="text-xs font-semibold text-ink block mb-1.5">
                Type <span className="text-rose-700 font-bold">{childName}</span> to confirm
              </label>
              <input
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                placeholder={childName}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setDeleteOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting || confirmName !== childName}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClassesTab({ enrollments, childId }: { enrollments: Enrollment[]; childId: string }) {
  if (enrollments.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
        <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><BookOpen className="size-5"/></div>
        <h2 className="font-bold text-ink">No classes enrolled yet</h2>
        <p className="text-sm text-muted-foreground mt-1">Browse classes to get started.</p>
      </div>
    );
  }
  const statusMeta: Record<string, { label: string; cls: string }> = {
    active:   { label: 'Active',            cls: 'bg-brand-soft text-brand-deep' },
    approved: { label: 'Active',            cls: 'bg-brand-soft text-brand-deep' },
    pending:  { label: 'Awaiting approval', cls: 'bg-sky-100 text-sky-800' },
    banned:   { label: 'Banned',            cls: 'bg-rose-100 text-rose-700' },
    suspended:{ label: 'Suspended',         cls: 'bg-amber-100 text-amber-800' },
    removed:  { label: 'Removed',           cls: 'bg-muted text-muted-foreground' },
  };
  return (
    <div className="space-y-3">
      {enrollments.map((e) => {
        const sm = statusMeta[e.status] ?? { label: e.status, cls: 'bg-muted text-muted-foreground' };
        return (
          <article key={e.groupId} className="rounded-2xl bg-background border border-border p-5">
            <div className="flex items-start gap-4">
              <div className="size-12 rounded-2xl bg-muted grid place-items-center text-2xl shrink-0">📚</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-ink truncate">{e.name}</h3>
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap', sm.cls)}>{sm.label}</span>
                </div>
                {e.subject && <div className="text-xs text-muted-foreground mt-0.5">{e.subject}</div>}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              {e.joinedAt && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="size-3.5"/> Enrolled {new Date(e.joinedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
                </div>
              )}
              <Link href={`/parent/children/${childId}/classes/${e.groupId}`} className="text-xs font-semibold text-brand-deep hover:underline ml-auto">View as student →</Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function OverviewTab({
  childName,
  enrollments,
  bookings,
  summary,
  feedback,
  onOpenReport,
  onGoTo,
}: {
  childName: string;
  enrollments: Enrollment[];
  bookings: Booking[];
  summary: AttSummary | null;
  feedback: FeedbackReport[];
  onOpenReport: (r: FeedbackReport) => void;
  onGoTo: (t: 'attendance' | 'classes') => void;
}) {
  const first = (childName || 'Your child').split(' ')[0];
  const active = enrollments.filter((e) => ['approved', 'active'].includes(e.status));
  // Soonest future booking. The kit leads with "Next class" because it is the
  // one thing a parent opens a child's page to check.
  const next = bookings
    .filter((b) => b.start && new Date(b.start).getTime() > Date.now())
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime())[0];
  const pending = bookings.filter((b) => b.status === 'PENDING_PARENT_APPROVAL');
  const latest = feedback[0];

  return (
    <>
      <div className="rounded-2xl border border-border bg-background p-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-brand-deep">
          Next class
        </div>
        {next ? (
          <>
            <div className="mt-0.5 text-lg font-bold text-ink">
              {next.subject || 'Tutoring session'}
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date(next.start!).toLocaleString('en-TT', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: 'America/Port_of_Spain',
              })}{' '}
              · {next.tutorName}
            </div>
          </>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nothing scheduled. {first} is in {active.length}{' '}
            {active.length === 1 ? 'class' : 'classes'}.
          </p>
        )}
      </div>

      {/* Folded in from the old Bookings tab: visible here, actioned in
          Approvals, since that is where the decision lives. */}
      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-ink">
            {pending.length} request{pending.length === 1 ? '' : 's'} waiting on you
          </div>
          <p className="mt-0.5 text-xs text-amber-900">
            No place is held while a request waits, and each one closes two hours before its class.
          </p>
          <Link
            href="/parent/approvals"
            className="mt-2 inline-block rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white"
          >
            Review requests
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => onGoTo('attendance')}
          className="rounded-2xl border border-border bg-background p-4 text-left hover:bg-muted/40"
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Attendance
          </div>
          {/* §6: the figure arrives with its denominator and is not recomputed. */}
          <div className="mt-0.5 text-xl font-extrabold tabular-nums text-ink">
            {summary?.rateLabel ?? 'Open to load'}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">See every session →</div>
        </button>

        {/* Feedback lives on its own page now, with the child selector and the
            request action. Linking out rather than duplicating keeps the monthly
            quota shown in exactly one place. */}
        <Link
          href="/parent/feedback"
          className="rounded-2xl border border-border bg-background p-4 text-left hover:bg-muted/40"
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Latest feedback
          </div>
          <div className="mt-0.5 line-clamp-2 text-sm text-ink">
            {latest ? latest.body : 'None yet — most classes produce none.'}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {latest ? `${latest.tutorName} · read it →` : 'You can request it once a month →'}
          </div>
        </Link>
      </div>

      {latest && (
        <button
          onClick={() => onOpenReport(latest)}
          className="w-full rounded-2xl border border-border bg-background p-4 text-left hover:bg-muted/40"
        >
          <div className="text-sm font-semibold text-ink">
            {latest.classTitle} · {latest.month}
          </div>
          <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{latest.body}</p>
        </button>
      )}
    </>
  );
}

function AttendanceTab({ rows, summary, loading }: { rows: AttRow[]; summary: AttSummary | null; loading: boolean }) {
  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />)}</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
        <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><ClipboardCheck className="size-5" /></div>
        <h2 className="font-bold text-ink">No attendance yet</h2>
        <p className="text-sm text-muted-foreground mt-1">Attendance is recorded when your child joins a session. Past sessions will show here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {summary && (
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Attendance
            </div>
            {/* §6: never a bare percentage. rateLabel comes from the shared
                helper — this used to recompute present/total locally, which is
                exactly how two surfaces start quoting different numbers for the
                same child. */}
            <div className="text-2xl font-bold text-ink tabular-nums">
              {summary.rateLabel ?? 'No sessions yet'}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Tally n={summary.attended ?? 0} label="attended" tone="text-brand-deep" />
            <Tally n={summary.late ?? 0} label="late" tone="text-amber-700" />
            <Tally n={summary.absent ?? 0} label="absent" tone="text-rose-600" />
            {(summary.cancelled ?? 0) > 0 && (
              <Tally n={summary.cancelled ?? 0} label="cancelled" tone="text-muted-foreground" />
            )}
          </div>

          {/* The §6 tutor-absent guard, explained where it changes the number.
              A denominator that silently shrinks looks like a bug. */}
          {(summary.excluded ?? 0) > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {summary.excluded} session{summary.excluded === 1 ? '' : 's'} not counted — the tutor
              never started the class, so nobody was marked absent for it.
            </p>
          )}

          {/* Decisions 16/17: automatic, and editable by nobody. Saying so stops
              a parent asking the tutor to change a record the tutor cannot
              change either. */}
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            Recorded automatically from when your child joins each class. Cancelled classes don&rsquo;t
            count against the rate, and nobody can edit these records — not the tutor, not iTutor
            support.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const s = ATT_STATUS[r.status ?? (r.present ? 'attended' : 'absent')] ?? ATT_STATUS.absent;
          const Icon = s.icon;
          return (
            <div key={r.key} className="flex items-center gap-3 rounded-2xl bg-background border border-border p-4">
              <span className={cn('size-9 rounded-xl grid place-items-center shrink-0', s.chip)}>
                <Icon className="size-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink truncate">{r.label}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {new Date(r.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{r.type}</span>
                </div>
                {r.status === 'excluded' && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    The class didn&rsquo;t run — not counted either way.
                  </div>
                )}
              </div>
              <span className={cn('shrink-0 text-xs font-bold uppercase tracking-wider text-right', s.text)}>
                {s.label}
                {/* The lateness, not just the label: "12 min late" is a
                    conversation, "Late" is a verdict. */}
                {r.status === 'late' && r.lateMinutes ? (
                  <span className="block text-[10px] font-semibold normal-case tracking-normal text-muted-foreground">
                    {r.lateMinutes} min late
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeedbackTab({ feedback, onOpen }: { feedback: FeedbackReport[]; onOpen: (r: FeedbackReport) => void }) {
  if (feedback.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
        <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><FileText className="size-5"/></div>
        <h2 className="font-bold text-ink">No reports yet</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">Tutors send monthly reports after each full month of enrolment.</p>
      </div>
    );
  }
  return (
    <ol className="space-y-3">
      {feedback.map((r) => (
        <li key={r.id}>
          <button onClick={() => onOpen(r)} className="w-full text-left rounded-2xl bg-background border border-border p-4 hover:border-brand-deep/40 transition flex items-center gap-3">
            <div className="size-10 rounded-xl bg-brand-soft text-brand-deep grid place-items-center shrink-0"><FileText className="size-4"/></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-ink truncate">{r.month} report · {r.classTitle}</h3>
                <ChevronRight className="size-4 text-muted-foreground"/>
              </div>
              <div className="text-xs text-muted-foreground">by {r.tutorName}</div>
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}

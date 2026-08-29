'use client';

// Parent read-only "view as student" of a linked child's class. Data comes from
// the parent_child_links-authorized API (NOT the student route) — the parent is
// never sent into a student-role page. Purely informational: no join/enrol.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, Check, X, BookOpen, Eye, Loader2, MessageSquare, Users, Pin, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Same vocabulary as the child attendance tab — §6 keeps it identical across
 *  surfaces rather than re-worded per screen. */
const CLASS_ATT: Record<string, { label: string; icon: typeof Check; chip: string; text: string }> = {
  attended:  { label: 'Attended',   icon: Check, chip: 'bg-brand-soft text-brand-deep',  text: 'text-brand-deep' },
  late:      { label: 'Late',       icon: Clock, chip: 'bg-amber-100 text-amber-700',    text: 'text-amber-700' },
  absent:    { label: 'Absent',     icon: X,     chip: 'bg-rose-100 text-rose-600',      text: 'text-rose-600' },
  cancelled: { label: 'Cancelled',  icon: Ban,   chip: 'bg-muted text-muted-foreground', text: 'text-muted-foreground' },
  excluded:  { label: 'Didn’t run', icon: Ban,   chip: 'bg-muted text-muted-foreground', text: 'text-muted-foreground' },
};
import ParentShell from '@/components/parent/ParentShell';
import ContentBlockRenderer from '@/components/student/ContentBlockRenderer';

type StreamPost = { id: string; authorName: string; authorAvatar: string | null; authorRole: string | null; postType: string; body: string; pinned: boolean; createdAt: string };
type Member = { id: string; name: string; avatarUrl: string | null; isChild: boolean };
type Data = {
  group: { id: string; name: string; subject: string | null; description: string | null; contentBlocks: unknown; tutorName: string };
  membershipStatus: string | null;
  upcoming: { id: string; start: string; end: string }[];
  attendance: {
    key: string;
    start: string;
    present: boolean;
    status?: 'attended' | 'late' | 'absent' | 'cancelled' | 'excluded' | null;
    lateMinutes?: number | null;
  }[];
  attendanceSummary?: { rateLabel?: string; excluded?: number } | null;
  stream: StreamPost[];
  members: Member[];
};

export default function ParentViewClassPage() {
  return <ParentShell><Content /></ParentShell>;
}

function Content() {
  const { childId, groupId } = useParams<{ childId: string; groupId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!childId || !groupId) return;
    (async () => {
      try {
        const res = await fetch(`/api/parent/children/${childId}/classes/${groupId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Could not load this class.'); return; }
        setData(json);
      } catch {
        setError('Could not load this class.');
      } finally {
        setLoading(false);
      }
    })();
  }, [childId, groupId]);

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href={`/parent/children/${childId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> Back to child
      </Link>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{error}</div>
      ) : data ? (
        <>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep bg-brand/10 px-3 py-1 rounded-full">
            <Eye className="size-3.5" /> Read-only — this is what your child sees
          </div>

          <header className="rounded-2xl bg-background border border-border p-5">
            <h1 className="text-xl font-bold text-ink">{data.group.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {[data.group.subject, `Tutor: ${data.group.tutorName}`].filter(Boolean).join(' · ')}
            </p>
            {data.membershipStatus && (
              <span className="mt-3 inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-brand-soft text-brand-deep">
                {['approved', 'active', 'ACTIVE', 'GRACE'].includes(data.membershipStatus) ? 'Enrolled' : data.membershipStatus}
              </span>
            )}
          </header>

          {/* Class material */}
          <section className="rounded-2xl bg-background border border-border p-5">
            <h2 className="font-bold text-ink mb-3 flex items-center gap-2"><BookOpen className="size-4 text-brand-deep" /> What you&apos;ll learn</h2>
            {data.group.contentBlocks ? (
              <ContentBlockRenderer content={data.group.contentBlocks} />
            ) : data.group.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.group.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No class material added yet.</p>
            )}
          </section>

          {/* Stream — the class feed (announcements/posts), read-only */}
          <section className="rounded-2xl bg-background border border-border p-5">
            <h2 className="font-bold text-ink mb-3 flex items-center gap-2"><MessageSquare className="size-4 text-brand-deep" /> Class stream</h2>
            {data.stream.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posts yet.</p>
            ) : (
              <div className="space-y-3">
                {data.stream.map((p) => (
                  <div key={p.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="size-7 rounded-full bg-brand/10 text-brand-deep grid place-items-center text-xs font-bold overflow-hidden">
                        {p.authorAvatar ? <img src={p.authorAvatar} alt="" className="size-7 object-cover" /> : (p.authorName[0] || '?').toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-ink">{p.authorName}</span>
                      {p.authorRole && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{p.authorRole}</span>}
                      {p.pinned && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700"><Pin className="size-3" /> Pinned</span>}
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                    {p.body && <p className="mt-2 text-sm text-ink/90 whitespace-pre-wrap">{p.body}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Upcoming sessions */}
          <section className="rounded-2xl bg-background border border-border p-5">
            <h2 className="font-bold text-ink mb-3 flex items-center gap-2"><Calendar className="size-4 text-brand-deep" /> Upcoming sessions</h2>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming sessions scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {data.upcoming.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm text-ink">
                    <Clock className="size-3.5 text-muted-foreground" />
                    {new Date(s.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {' · '}
                    {new Date(s.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Members — persons in the class */}
          <section className="rounded-2xl bg-background border border-border p-5">
            <h2 className="font-bold text-ink mb-3 flex items-center gap-2"><Users className="size-4 text-brand-deep" /> In this class <span className="text-muted-foreground font-normal">({data.members.length})</span></h2>
            {data.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other students yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.members.map((m) => (
                  <span key={m.id} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm', m.isChild ? 'border-brand/40 bg-brand/5 text-brand-deep font-semibold' : 'border-border bg-background text-ink')}>
                    <span className="size-6 rounded-full bg-brand/10 text-brand-deep grid place-items-center text-[11px] font-bold overflow-hidden">
                      {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="size-6 object-cover" /> : (m.name[0] || '?').toUpperCase()}
                    </span>
                    {m.name}{m.isChild ? ' (your child)' : ''}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* In-class attendance */}
          <section className="rounded-2xl bg-background border border-border p-5">
            <h2 className="font-bold text-ink mb-3 flex items-center gap-2"><Check className="size-4 text-brand-deep" /> Attendance in this class</h2>
            {/* §6: the rate arrives with its denominator attached and is never
                recomputed here. */}
            {data.attendanceSummary?.rateLabel && (
              <p className="mb-3 text-sm font-semibold text-ink">
                {data.attendanceSummary.rateLabel}
                {(data.attendanceSummary.excluded ?? 0) > 0 && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {data.attendanceSummary.excluded} not counted, the class didn&rsquo;t run
                  </span>
                )}
              </p>
            )}
            {data.attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past sessions yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.attendance.map((a) => {
                  const s = CLASS_ATT[a.status ?? (a.present ? 'attended' : 'absent')] ?? CLASS_ATT.absent;
                  const Icon = s.icon;
                  return (
                    <li key={a.key} className="flex items-center gap-2 text-sm">
                      <span className={cn('size-6 rounded-lg grid place-items-center shrink-0', s.chip)}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className="text-ink">{new Date(a.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <span className={cn('ml-auto text-xs font-bold uppercase tracking-wider', s.text)}>
                        {s.label}
                        {a.status === 'late' && a.lateMinutes ? (
                          <span className="ml-1 font-semibold normal-case tracking-normal text-muted-foreground">
                            {a.lateMinutes} min
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

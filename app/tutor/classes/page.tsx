'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Lock, Plus, Search, Users, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import TutorShell from '@/components/tutor/TutorShell';
import type { GroupWithTutor, GroupPricingMode } from '@/lib/types/groups';

export default function TutorLessonsPage() {
  return (
    <TutorShell>
      <LessonsContent />
    </TutorShell>
  );
}

const GRADIENT_BY_IDX = [
  'from-brand to-brand-deep',
  'from-violet-500 to-purple-700',
  'from-sky-500 to-blue-700',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-700',
  'from-teal-500 to-emerald-700',
];

function LessonsContent() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const completion = useTutorCompletion(profile);
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<GroupWithTutor[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!profileLoading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [profileLoading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    setFetching(true);
    fetch('/api/groups')
      .then((r) => r.json())
      .then((data) => {
        const all: GroupWithTutor[] = Array.isArray(data?.groups) ? data.groups : Array.isArray(data) ? data : [];
        setGroups(all.filter((g) => g.tutor_id === profile.id));
      })
      .catch(() => setGroups([]))
      .finally(() => setFetching(false));
  }, [profile?.id]);

  if (completion.loading || fetching) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  if (!completion.listed) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Lock className="size-10 mx-auto text-muted-foreground/40" />
          <h2 className="mt-3 text-xl font-bold text-ink">My Classes is locked</h2>
          <p className="mt-2 text-sm text-muted-foreground">Complete your profile to start creating 1:1 and group classes.</p>
          <Link href="/tutor/get-listed" className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-deep">
            Complete profile
          </Link>
        </div>
      </div>
    );
  }

  const filtered = groups.filter(
    (g) => !search || g.name.toLowerCase().includes(search.toLowerCase()) || (g.subject ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="max-w-7xl space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Classes</h1>
          <p className="text-sm text-muted-foreground mt-1">Create, manage, and grow your classes</p>
        </div>
        <Link href="/tutor/classes/new" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep shrink-0">
          <Plus className="size-4" /> Create a Class
        </Link>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground font-medium">
          <span className="text-ink font-bold tabular-nums">{groups.length}</span> class{groups.length !== 1 ? 'es' : ''}
        </div>
        <div className="relative hidden sm:block w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search classes…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <BookOpen className="size-10 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? 'No classes match your search' : 'No classes yet'}</p>
          {!search && <p className="mt-1 text-xs text-muted-foreground">Create your first class to get started.</p>}
          {!search && (
            <Link href="/tutor/classes/new" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
              <Plus className="size-4" /> Create a class
            </Link>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((g, i) => <GroupCard key={g.id} g={g} idx={i} />)}
        </div>
      )}
    </div>
  );
}

function pricingLabel(g: GroupWithTutor): string {
  const mode: GroupPricingMode | undefined = g.pricing_mode;
  if (mode === 'FREE' || g.pricing === 'FREE') return 'Free';
  if (mode === 'PER_SESSION' && g.price_per_session) return `TTD ${g.price_per_session}/session`;
  if (mode === 'PER_COURSE' && g.price_per_course) return `TTD ${g.price_per_course}/course`;
  if (g.price_monthly) return `TTD ${g.price_monthly}/mo`;
  if (g.price_per_session) return `TTD ${g.price_per_session}/session`;
  return g.pricing ?? 'See details';
}

function memberCount(g: GroupWithTutor): number {
  if (typeof g.member_count === 'number') return g.member_count;
  const members = (g as any).group_members;
  return Array.isArray(members) ? members.filter((m: any) => m.status === 'approved').length : 0;
}

function GroupCard({ g, idx }: { g: GroupWithTutor; idx: number }) {
  const enrolled = memberCount(g);
  const gradient = GRADIENT_BY_IDX[idx % GRADIENT_BY_IDX.length];
  const isDraft = g.status === 'DRAFT';
  const rating = g.tutor?.rating_average;

  return (
    <Link
      href={`/tutor/classes/${g.id}`}
      className="rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition group"
    >
      {g.cover_image ? (
        <div className="h-32 bg-muted overflow-hidden">
          <img src={g.cover_image} alt={g.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className={cn('relative h-32 bg-gradient-to-br', gradient)}>
          <div className="absolute inset-0 flex items-center justify-center">
            <BookOpen className="size-8 text-white/70" />
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-ink line-clamp-2 leading-snug">{g.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {[g.subject, g.form_level].filter(Boolean).join(' · ') || 'General'}
            </div>
          </div>
          {isDraft && (
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">Draft</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1 text-xs pt-3 border-t border-border divide-x divide-border">
          <div className="pr-2">
            <div className="text-muted-foreground">Members</div>
            <div className="font-bold tabular-nums text-ink mt-0.5">
              {enrolled}{g.max_students ? `/${g.max_students}` : ''}
            </div>
          </div>
          <div className="px-2">
            <div className="text-muted-foreground">Level</div>
            <div className="font-bold text-ink mt-0.5 truncate">{g.form_level ?? '—'}</div>
          </div>
          <div className="pl-2">
            <div className="text-muted-foreground">Schedule</div>
            <div className="font-bold text-ink mt-0.5 truncate">{g.session_frequency ?? g.recurrence_type ?? '—'}</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-soft/50 text-brand-deep text-[11px] font-semibold">
            {pricingLabel(g)}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {rating != null && rating > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="size-3 text-amber-400 fill-amber-400" />
                <span className="font-medium text-ink">{Number(rating).toFixed(1)}</span>
              </span>
            )}
            <Users className="size-3" />
            <span className="tabular-nums">{enrolled} member{enrolled !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

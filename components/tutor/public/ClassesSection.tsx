'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import PublicClassCard, { PublicClass } from './PublicClassCard';

const ACCENTS: NonNullable<PublicClass['accent']>[] = ['mint', 'sky', 'peach', 'lavender', 'coral'];

export default function ClassesSection({
  tutorId,
  tutorFirstName,
}: {
  tutorId: string;
  tutorFirstName: string;
}) {
  const router = useRouter();
  const [classes, setClasses] = useState<PublicClass[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/groups?tutor_id=${tutorId}`);
        const data = await res.json();
        const groups: any[] = data?.data?.groups ?? data?.groups ?? [];

        // Accurate seat counts (subscriptions + members) come from the dedicated
        // endpoint — the list's member_count misses subscription enrollments.
        let counts: Record<string, number> = {};
        const ids = groups.map((g) => g.id).filter(Boolean);
        if (ids.length > 0) {
          try {
            const cRes = await fetch(`/api/groups/member-counts?ids=${ids.join(',')}`);
            if (cRes.ok) counts = (await cRes.json())?.counts ?? {};
          } catch { /* fall back to list member_count below */ }
        }

        const mapped: PublicClass[] = groups.map((g, i) => {
          const price = Number(g.price_monthly ?? g.price_per_session ?? 0);
          const period = g.price_monthly ? 'mo' : 'session';
          const promo = g.active_promotion;
          const discount = promo?.discount ? Math.round(price * (1 - promo.discount / 100)) : null;
          const effective = discount ?? price;
          const priceLabel = price > 0 ? `${fmtTTD(effective)}/${period}` : 'Free';

          const total = g.max_students ?? null;
          const taken = counts[g.id] ?? g.member_count ?? g.enrollmentCount ?? 0;

          return {
            id: g.id,
            name: g.name ?? 'Untitled class',
            subject: g.subject ?? '',
            description: g.description ?? null,
            kind: total === 1 ? '1:1' : 'group',
            level: g.form_level || 'All levels',
            scheduleLabel: g.schedule_display || 'Schedule TBC',
            priceLabel,
            spaces: total ? { taken, total } : undefined,
            accent: ACCENTS[i % ACCENTS.length],
          };
        });

        if (!cancelled) setClasses(mapped);
      } catch {
        if (!cancelled) setClasses([]);
      }
    })();
    return () => { cancelled = true; };
  }, [tutorId]);

  if (classes === null) {
    return (
      <section className="rounded-3xl bg-background border border-border p-6">
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
      </section>
    );
  }

  if (classes.length === 0) return null; // no classes → hide the section

  return (
    <section className="rounded-3xl bg-background border border-border p-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-deep">
            <Sparkles className="size-3" /> Live classes
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {tutorFirstName}&apos;s classes
          </h2>
          <p className="text-xs text-ink-muted">
            Join a scheduled class or request a spot — everything you need in one place.
          </p>
        </div>
        <span className="hidden text-xs text-ink-muted sm:block">
          {classes.length} available
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {classes.map((c) => (
          <PublicClassCard key={c.id} c={c} onOpen={(id) => router.push(`/student/explore/${id}`)} />
        ))}
      </div>
    </section>
  );
}

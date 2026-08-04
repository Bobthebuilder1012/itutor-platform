'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import VerifiedBadge from '@/components/VerifiedBadge';

type SubjectRate = { id: string; name: string; curriculum: string; price: number };
type ReviewItem = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  student?: { full_name?: string | null; username?: string | null } | null;
};

// Read-only mirror of the tutor's own public profile (summary + subjects/rates +
// reviews), so they see exactly what a student sees. Reuses the same public
// reviews API the student profile uses, so the rating/count match.
export default function ProfilePreviewPanel({ profile }: { profile: any }) {
  const tutorId: string | undefined = profile?.id;
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectRate[]>([]);
  const [paidEnabled, setPaidEnabled] = useState(false);

  useEffect(() => {
    if (!tutorId) return;
    let cancelled = false;

    (async () => {
      // Ratings + first 2 reviews — same deduped source as the public profile.
      try {
        const res = await fetch(`/api/public/tutors/${tutorId}/reviews?limit=2&offset=0`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const a = data?.averageRating == null ? null : Number(data.averageRating);
        setAvg(Number.isFinite(a as number) ? (a as number) : null);
        setCount(typeof data?.ratingCount === 'number' ? data.ratingCount : 0);
        setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
      } catch { /* leave empty */ }

      // The tutor's own subjects + hourly rates.
      try {
        const { data: rows } = await supabase
          .from('tutor_subjects')
          .select('id, subject_id, price_per_hour_ttd, subjects(name, label, curriculum)')
          .eq('tutor_id', tutorId);
        if (cancelled) return;
        setSubjects(
          (rows ?? []).map((r: any) => {
            const s = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
            return {
              id: r.id,
              name: s?.label || s?.name || 'Subject',
              curriculum: s?.curriculum || '',
              price: r.price_per_hour_ttd ?? 0,
            };
          })
        );
      } catch { /* leave empty */ }
    })();

    // Match the public page: 1:1 rates are gated behind the paid-classes flag.
    fetch('/api/feature-flags', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setPaidEnabled(!!d?.paidClassesEnabled); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [tutorId]);

  const name = getDisplayName(profile);
  const isVerified = profile?.tutor_verification_status === 'VERIFIED';
  const initials = (name || 'T').split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      {/* Summary */}
      <section className="rounded-3xl bg-background border border-border p-6">
        <div className="flex items-start gap-4">
          <div className="size-16 rounded-2xl bg-brand grid place-items-center text-white text-lg font-bold overflow-hidden shrink-0">
            {profile?.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={profile.avatar_url} alt="" className="size-16 object-cover" />
              : initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-bold text-ink truncate">{name}</h2>
              {isVerified && <VerifiedBadge size="sm" />}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-sm">
              {avg !== null ? (
                <span className="inline-flex items-center gap-1 font-semibold text-ink">
                  <Star className="size-4 fill-coral text-coral" /> {avg.toFixed(1)}
                  <span className="font-normal text-muted-foreground">({count} review{count === 1 ? '' : 's'})</span>
                </span>
              ) : (
                <span className="text-muted-foreground">No reviews yet</span>
              )}
            </div>
            {profile?.country && (
              <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {profile.country}
              </div>
            )}
          </div>
        </div>
        {profile?.bio && <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>}
      </section>

      {/* Subjects & rates */}
      <section className="rounded-3xl bg-background border border-border p-6">
        <h3 className="font-semibold text-ink mb-3">Subjects &amp; rates</h3>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects listed</p>
        ) : (
          <ul className="divide-y divide-border">
            {subjects.map((s) => (
              <li key={s.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink">{s.name}</div>
                  {s.curriculum && <div className="text-xs text-muted-foreground">{s.curriculum}</div>}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold text-ink">
                    {!paidEnabled ? 'Free' : s.price > 0 ? fmtTTD(s.price) : 'Rate not set'}
                  </span>
                  {paidEnabled && s.price > 0 && <span className="text-xs text-muted-foreground">/hr</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reviews */}
      <section className="rounded-3xl bg-background border border-border p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-ink">Reviews{count > 0 ? ` · ${count}` : ''}</h3>
          {count > 0 && (
            <Link href="/tutor/reviews" className="text-xs font-semibold text-brand-deep hover:underline">
              See all {count} →
            </Link>
          )}
        </div>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-ink">{r.student?.full_name || 'Student'}</span>
                  <div className="flex">
                    {Array.from({ length: r.stars }).map((_, i) => (
                      <Star key={i} className="size-3 fill-coral text-coral" />
                    ))}
                  </div>
                </div>
                {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

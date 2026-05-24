'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { RatingBreakdown, type RatingDistribution } from '@/components/ratings/RatingBreakdown';
import { StarRow } from '@/components/ratings/StarInput';
import { getDisplayName } from '@/lib/utils/displayName';

type ClassRow = {
  id: string;
  name: string;
  rating_average: number;
  rating_count: number;
};

type DistributionData = {
  average: number;
  count: number;
  distribution: RatingDistribution;
};

export default function TutorMyRatingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();

  const [overall, setOverall] = useState<DistributionData | null>(null);
  const [oneOnOneDist, setOneOnOneDist] = useState<DistributionData | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    async function load() {
      try {
        const [distRes, classesRes] = await Promise.all([
          fetch(`/api/tutor/${profile!.id}/rating-distribution`),
          supabase
            .from('groups')
            .select('id, name, rating_average, rating_count')
            .eq('tutor_id', profile!.id)
            .is('archived_at', null)
            .order('created_at', { ascending: false }),
        ]);

        if (distRes.ok) {
          const data = await distRes.json();
          setOverall(data);
        }

        // 1-on-1 only distribution
        const { data: oneOnOneRatings } = await supabase
          .from('ratings')
          .select('stars')
          .eq('tutor_id', profile!.id)
          .eq('is_test_data', false);

        if (oneOnOneRatings && oneOnOneRatings.length > 0) {
          const dist: RatingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
          for (const r of oneOnOneRatings) {
            if (r.stars >= 1 && r.stars <= 5) dist[r.stars as keyof RatingDistribution]++;
          }
          const avg =
            oneOnOneRatings.reduce((s: number, r: { stars: number }) => s + r.stars, 0) /
            oneOnOneRatings.length;
          setOneOnOneDist({
            average: parseFloat(avg.toFixed(2)),
            count: oneOnOneRatings.length,
            distribution: dist,
          });
        }

        if (classesRes.data) {
          setClasses(classesRes.data as ClassRow[]);
        }
      } finally {
        setLoadingData(false);
      }
    }

    load();
  }, [profile, profileLoading, router]);

  const hideOneOnOne = profile?.tutor_format_preference === 'classes_only';

  if (profileLoading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <DashboardLayout role="tutor" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Ratings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregate performance data. Individual student identities are never shown.
          </p>
        </div>

        {/* Overall breakdown */}
        {overall && (
          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">Overall Rating</h2>
            <RatingBreakdown
              rating={overall.average}
              count={overall.count}
              distribution={overall.distribution}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
            />
          </section>
        )}

        {/* Per-class section */}
        {classes.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">By Class</h2>
            <div className="space-y-3">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-white p-4"
                >
                  <div className="font-semibold text-ink text-sm">{cls.name}</div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StarRow value={cls.rating_average} size={14} />
                    <span className="text-sm font-bold text-ink tabular-nums">
                      {cls.rating_average > 0
                        ? cls.rating_average.toFixed(1)
                        : '—'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {cls.rating_count.toLocaleString()}{' '}
                      {cls.rating_count === 1 ? 'rating' : 'ratings'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 1-on-1 section */}
        {!hideOneOnOne && (
          <section>
            <h2 className="text-lg font-semibold text-ink mb-3">1-on-1 Sessions</h2>
            {oneOnOneDist && oneOnOneDist.count > 0 ? (
              <RatingBreakdown
                rating={oneOnOneDist.average}
                count={oneOnOneDist.count}
                distribution={oneOnOneDist.distribution}
              />
            ) : (
              <div className="rounded-2xl border border-border bg-white p-6 text-center text-muted-foreground text-sm">
                No 1-on-1 session ratings yet.
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}

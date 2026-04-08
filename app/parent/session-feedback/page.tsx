'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import UniversalSearchBar from '@/components/UniversalSearchBar';
import { useProfile } from '@/lib/hooks/useProfile';
import { getDisplayName } from '@/lib/utils/displayName';

type TutorNote = {
  id: string;
  childId: string;
  childName: string;
  tutorName: string;
  subjectName: string;
  feedbackText: string;
  createdAt: string;
};

type StudentReview = {
  id: string;
  childId: string;
  childName: string;
  tutorName: string;
  subjectName: string;
  stars: number;
  comment: string | null;
  createdAt: string;
};

type FeedbackPayload = {
  children: { id: string; name: string }[];
  tutorNotes: TutorNote[];
  studentReviews: StudentReview[];
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type ClassBucket<T> = { subjectName: string; tutorName: string; items: T[] };

/** One section per subject + tutor so the same tutor teaching Math vs Physics appears twice. */
function groupFeedbackByClass<T extends { subjectName: string; tutorName: string; createdAt: string }>(
  rows: T[]
): ClassBucket<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.subjectName, row.tutorName]);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return Array.from(map.entries())
    .map(([key, items]) => {
      const [subjectName, tutorName] = JSON.parse(key) as [string, string];
      return {
        subjectName,
        tutorName,
        items: [...items].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      };
    })
    .sort((a, b) => {
      const bySubject = a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: 'base' });
      if (bySubject !== 0) return bySubject;
      return a.tutorName.localeCompare(b.tutorName, undefined, { sensitivity: 'base' });
    });
}

export default function ParentSessionFeedbackPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [data, setData] = useState<FeedbackPayload | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }
    void (async () => {
      setLoadingData(true);
      setError(null);
      let redirectNoChildren = false;
      try {
        const res = await fetch('/api/parent/feedback');
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load feedback');
        const children = json.children ?? [];
        if (children.length === 0) {
          redirectNoChildren = true;
          router.replace('/parent/dashboard');
          return;
        }
        setData({
          children,
          tutorNotes: json.tutorNotes ?? [],
          studentReviews: json.studentReviews ?? [],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!redirectNoChildren) setLoadingData(false);
      }
    })();
  }, [profile, loading, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green" />
      </div>
    );
  }

  const displayName = getDisplayName(profile);

  return (
    <DashboardLayout role="parent" userName={displayName}>
      <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-1 bg-gradient-to-br from-gray-50 to-white">
        <UniversalSearchBar
          userRole="parent"
          onResultClick={(tutor) => router.push(`/parent/tutors/${tutor.id}`)}
        />
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session feedback</h1>
          <p className="mt-1 text-sm text-gray-600">
            Tutor notes after sessions and reviews your children submitted—visible for oversight across all linked
            students.
          </p>
        </div>

        {loadingData ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-gray-600">Loading feedback…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
        ) : !data ? null : data.children.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
            <p className="text-gray-700 font-medium">No linked children</p>
            <p className="mt-2 text-sm text-gray-600">Link a student account to see their session feedback here.</p>
            <Link
              href="/parent/add-child"
              className="mt-6 inline-flex rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
            >
              Add or link a child
            </Link>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">Tutor notes</h2>
              <p className="mt-1 text-sm text-gray-500">
                Written feedback from iTutors after completed sessions, grouped by class (subject and tutor).
              </p>
              {data.tutorNotes.length === 0 ? (
                <p className="mt-6 text-gray-600">No tutor notes yet.</p>
              ) : (
                <div className="mt-5 space-y-8">
                  {groupFeedbackByClass(data.tutorNotes).map((bucket) => (
                    <div key={`note-${bucket.subjectName}-${bucket.tutorName}`}>
                      <h3 className="border-b border-amber-200 pb-2 text-base font-bold text-gray-900">
                        <span className="text-amber-900">{bucket.subjectName}</span>
                        <span className="font-normal text-gray-500"> · with </span>
                        <span className="font-semibold text-gray-800">{bucket.tutorName}</span>
                      </h3>
                      <ul className="mt-4 space-y-4">
                        {bucket.items.map((note) => (
                          <li
                            key={note.id}
                            className="rounded-xl border border-amber-100 bg-amber-50/80 p-4"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-800">{note.childName}</p>
                              <time className="text-xs text-gray-500">{formatDate(note.createdAt)}</time>
                            </div>
                            <p className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">{note.feedbackText}</p>
                            <Link
                              href={`/parent/child/${note.childId}`}
                              className="mt-3 inline-block text-xs font-semibold text-amber-800 hover:text-amber-900"
                            >
                              View child profile
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-purple-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">Student reviews</h2>
              <p className="mt-1 text-sm text-gray-500">
                Star ratings and comments your children left for their tutors, grouped by class (subject and tutor).
              </p>
              {data.studentReviews.length === 0 ? (
                <p className="mt-6 text-gray-600">No reviews submitted yet.</p>
              ) : (
                <div className="mt-5 space-y-8">
                  {groupFeedbackByClass(data.studentReviews).map((bucket) => (
                    <div key={`rev-${bucket.subjectName}-${bucket.tutorName}`}>
                      <h3 className="border-b border-purple-200 pb-2 text-base font-bold text-gray-900">
                        <span className="text-purple-900">{bucket.subjectName}</span>
                        <span className="font-normal text-gray-500"> · with </span>
                        <span className="font-semibold text-gray-800">{bucket.tutorName}</span>
                      </h3>
                      <ul className="mt-4 space-y-4">
                        {bucket.items.map((rev) => (
                          <li
                            key={rev.id}
                            className="rounded-xl border border-purple-100 bg-purple-50/60 p-4"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-800">{rev.childName}</p>
                              <time className="text-xs text-gray-500">{formatDate(rev.createdAt)}</time>
                            </div>
                            <div className="mt-2 flex items-center gap-1">
                              {Array.from({ length: 5 }, (_, i) => (
                                <span
                                  key={i}
                                  className={i < rev.stars ? 'text-yellow-500' : 'text-gray-300'}
                                  aria-hidden
                                >
                                  ★
                                </span>
                              ))}
                              <span className="ml-2 text-sm font-semibold text-gray-800">{rev.stars}/5</span>
                            </div>
                            {rev.comment ? (
                              <p className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">{rev.comment}</p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-3">
                              <Link
                                href={`/parent/child/${rev.childId}/ratings`}
                                className="text-xs font-semibold text-purple-800 hover:text-purple-900"
                              >
                                All reviews for this child
                              </Link>
                              <Link
                                href={`/parent/child/${rev.childId}`}
                                className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                              >
                                Child profile
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

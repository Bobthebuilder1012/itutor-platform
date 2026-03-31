'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';
import { getDisplayName } from '@/lib/utils/displayName';
import { getBookingStatusColor, getBookingStatusLabel } from '@/lib/types/booking';

type ChildDetail = {
  child: {
    id: string;
    color: string;
    fullName: string;
    displayName: string | null;
    email: string | null;
    school: string | null;
    formLevel: string | null;
    subjectsOfStudy: string[];
  };
  stats: {
    classes: number;
    bookings: number;
    upcomingSessions: number;
  };
  classes: Array<{
    subjectName: string;
    tutorName: string;
  }>;
  bookings: Array<{
    id: string;
    tutorName: string;
    subjectName: string;
    status: string;
    requestedStartAt: string;
    confirmedStartAt: string | null;
    durationMinutes: number;
    priceTtd: number;
  }>;
  sessions: Array<{
    id: string;
    bookingId: string;
    tutorName: string;
    subjectName: string;
    status: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    durationMinutes: number;
  }>;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-TT', {
    style: 'currency',
    currency: 'TTD',
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ParentChildPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const childId = params.childId as string;
  const [data, setData] = useState<ChildDetail | null>(null);
  const [loadingChild, setLoadingChild] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    void fetchChild();
  }, [profile, loading, router, childId]);

  async function fetchChild() {
    setLoadingChild(true);
    setError(null);

    try {
      const response = await fetch(`/api/parent/children/${childId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to load child');
      }

      setData(result.child as ChildDetail);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load child');
    } finally {
      setLoadingChild(false);
    }
  }

  if (loading || loadingChild || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout role="parent" userName={getDisplayName(profile)}>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error || 'Child not found'}
        </div>
      </DashboardLayout>
    );
  }

  const child = data.child;

  return (
    <DashboardLayout role="parent" userName={getDisplayName(profile)}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-0 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <button
              onClick={() => router.push('/parent/dashboard')}
              className="mb-3 text-sm font-medium text-purple-600 hover:text-purple-700"
            >
              Back to parent dashboard
            </button>
            <h1 className="text-3xl font-bold text-gray-900">{child.fullName}</h1>
            <p className="mt-1 text-gray-600">
              {child.school || 'School not set'}
              {child.formLevel ? ` • ${child.formLevel}` : ''}
            </p>
          </div>
          <Link
            href="/parent/search"
            className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white transition hover:bg-purple-700"
          >
            Book a Tutor
          </Link>
        </div>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-purple-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Classes</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{data.stats.classes}</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Bookings</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{data.stats.bookings}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Upcoming Sessions</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{data.stats.upcomingSessions}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Student Information</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium text-gray-900">{child.email || 'Not set'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Form Level</p>
                <p className="font-medium text-gray-900">{child.formLevel || 'Not set'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm text-gray-500">Subjects of Study</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {child.subjectsOfStudy.length > 0 ? (
                    child.subjectsOfStudy.map((subject) => (
                      <span
                        key={subject}
                        className="rounded-full bg-purple-50 px-3 py-1 text-sm font-medium text-purple-700"
                      >
                        {subject}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">No subjects added yet.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Quick Links</h2>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <Link
                href={`/parent/child/${child.id}/bookings`}
                className="rounded-lg border border-gray-200 px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
              >
                View bookings
              </Link>
              <Link
                href={`/parent/child/${child.id}/sessions`}
                className="rounded-lg border border-gray-200 px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
              >
                View sessions
              </Link>
              <Link
                href="/parent/search"
                className="rounded-lg border border-gray-200 px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Book a tutor
              </Link>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Classes</h2>
            </div>
            {data.classes.length === 0 ? (
              <p className="text-gray-600">No classes yet.</p>
            ) : (
              <div className="space-y-3">
                {data.classes.map((entry) => (
                  <div
                    key={`${entry.subjectName}-${entry.tutorName}`}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <p className="font-semibold text-gray-900">{entry.subjectName}</p>
                    <p className="text-sm text-gray-600">with {entry.tutorName}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Recent Sessions</h2>
              <Link
                href={`/parent/child/${child.id}/sessions`}
                className="text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                View all
              </Link>
            </div>
            {data.sessions.length === 0 ? (
              <p className="text-gray-600">No sessions yet.</p>
            ) : (
              <div className="space-y-3">
                {data.sessions.slice(0, 4).map((session) => (
                  <div key={session.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="font-semibold text-gray-900">{session.subjectName}</p>
                    <p className="text-sm text-gray-600">with {session.tutorName}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {formatDateTime(session.scheduledStartAt)} • {session.durationMinutes} min
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Recent Bookings</h2>
            <Link
              href={`/parent/child/${child.id}/bookings`}
              className="text-sm font-semibold text-green-700 hover:text-green-800"
            >
              View all
            </Link>
          </div>
          {data.bookings.length === 0 ? (
            <p className="text-gray-600">No bookings yet.</p>
          ) : (
            <div className="space-y-3">
              {data.bookings.slice(0, 5).map((booking) => (
                <div
                  key={booking.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{booking.subjectName}</p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold border ${getBookingStatusColor(
                          booking.status as any
                        )}`}
                      >
                        {getBookingStatusLabel(booking.status as any)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">with {booking.tutorName}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {formatDateTime(booking.confirmedStartAt || booking.requestedStartAt)} •{' '}
                      {booking.durationMinutes} min
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(booking.priceTtd)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';
import { getDisplayName } from '@/lib/utils/displayName';

type ChildSessionsData = {
  child: {
    id: string;
    fullName: string;
  };
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

export default function ParentChildSessionsPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const childId = params.childId as string;
  const [data, setData] = useState<ChildSessionsData | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    void fetchSessions();
  }, [profile, loading, router, childId]);

  async function fetchSessions() {
    setLoadingSessions(true);
    setError(null);

    try {
      const response = await fetch(`/api/parent/children/${childId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to load sessions');
      }

      setData(result.child as ChildSessionsData);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }

  if (loading || loadingSessions || !profile) {
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
          {error || 'Unable to load sessions'}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="parent" userName={getDisplayName(profile)}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-0 space-y-6">
        <div>
          <Link
            href={`/parent/child/${childId}`}
            className="text-sm font-medium text-purple-600 hover:text-purple-700"
          >
            Back to {data.child.fullName}
          </Link>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">{data.child.fullName}'s Sessions</h1>
          <p className="mt-1 text-gray-600">Upcoming and recent sessions for this child.</p>
        </div>

        {data.sessions.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-gray-600">No sessions yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{session.subjectName}</p>
                    <p className="text-sm text-gray-600">with {session.tutorName}</p>
                    <p className="mt-2 text-sm text-gray-500">
                      {formatDateTime(session.scheduledStartAt)} • {session.durationMinutes} min
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{session.status}</p>
                    <p className="text-sm text-gray-500">{formatDateTime(session.scheduledEndAt)} end</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

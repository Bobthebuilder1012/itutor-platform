'use client';

import { useMemo, useState } from 'react';
import EnrollmentModal from '@/components/student/EnrollmentModal';
import CalendarPreview from '@/components/shared/CalendarPreview';
import ContentBlockRenderer from '@/components/student/ContentBlockRenderer';
import ReviewCard from '@/components/student/ReviewCard';

type SessionRow = { id: string; scheduled_start_at: string; meeting_link?: string | null };

export default function GroupDetailClient({
  group,
}: {
  group: {
    id: string;
    name: string;
    description?: string | null;
    subject?: string | null;
    timezone?: string | null;
    content_blocks?: unknown;
    tutor?: { full_name?: string | null; response_time_minutes?: number | null } | null;
    upcoming_sessions?: SessionRow[];
    sessions?: Array<{ occurrences?: SessionRow[] }>;
    reviews?: Array<any>;
    average_rating?: number;
    enrollment_count?: number;
  };
}) {
  const [open, setOpen] = useState(false);
  const sessions = useMemo(() => {
    const upcoming = group.upcoming_sessions ?? [];
    if (upcoming.length > 0) return upcoming;
    return (group.sessions ?? []).flatMap((session) => session.occurrences ?? []);
  }, [group]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
            <p className="mt-1 text-sm text-gray-600">{group.subject || 'General'} · Tutor: {group.tutor?.full_name ?? 'Tutor'}</p>
            <p className="mt-3 text-sm text-gray-700">{group.description || 'No description provided yet.'}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-sm">
            <p className="text-gray-700">Enrolled: {group.enrollment_count ?? 0}</p>
            <p className="text-gray-700">Rating: {group.average_rating ? group.average_rating.toFixed(1) : 'N/A'}</p>
            <p className="text-gray-700">
              Tutor response: {group.tutor?.response_time_minutes ? `${group.tutor.response_time_minutes} min` : 'Not specified'}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            Enroll
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-gray-900">What you will learn</h2>
            <div className="mt-3">
              <ContentBlockRenderer content={group.content_blocks} />
            </div>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>
            <div className="mt-3 space-y-3">
              {(group.reviews ?? []).length === 0 ? (
                <p className="text-sm text-gray-600">No reviews yet.</p>
              ) : (
                (group.reviews ?? []).map((review) => <ReviewCard key={review.id} review={review} />)
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Upcoming sessions</h2>
          <div className="mt-3">
            <CalendarPreview
              sessionDates={sessions.map((session) => new Date(session.scheduled_start_at))}
              timezone={group.timezone ?? 'UTC'}
            />
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {sessions.slice(0, 10).map((session) => (
                <div key={session.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                  <p className="font-medium text-gray-800">{new Date(session.scheduled_start_at).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-gray-600">{session.meeting_link ? 'Meeting link ready' : 'Meeting link generated when needed'}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <EnrollmentModal
        open={open}
        groupId={group.id}
        sessions={sessions.map((session) => ({ id: session.id, scheduled_start_at: session.scheduled_start_at }))}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}


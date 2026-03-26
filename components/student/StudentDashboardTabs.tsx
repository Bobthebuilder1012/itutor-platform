'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import NotificationsList from '@/components/student/NotificationsList';
import { isGroupsFeatureEnabled } from '@/lib/featureFlags/groupsFeature';

type Enrollment = {
  id: string;
  status: string;
  group?: { id: string; name?: string | null; subject?: string | null } | null;
  session?: { id: string; scheduled_start_at?: string | null }[] | null;
};

async function getEnrollments(): Promise<Enrollment[]> {
  const res = await fetch('/api/students/me/enrollments?status=ACTIVE', { cache: 'no-store' });
  const payload = await res.json();
  if (!res.ok || payload?.success === false) throw new Error(payload?.error ?? 'Failed to load enrollments');
  return payload?.data ?? [];
}

async function getUnreadCount(): Promise<number> {
  const res = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
  const payload = await res.json();
  if (!res.ok || payload?.success === false) return 0;
  return payload?.data?.unreadCount ?? 0;
}

export default function StudentDashboardTabs() {
  const groupsOn = isGroupsFeatureEnabled();
  const [tab, setTab] = useState<'upcoming' | 'groups' | 'notifications'>('upcoming');
  const enrollmentsQuery = useQuery({ queryKey: ['student-enrollments'], queryFn: getEnrollments });

  useEffect(() => {
    if (!groupsOn && tab === 'groups') setTab('upcoming');
  }, [groupsOn, tab]);
  const unreadQuery = useQuery({
    queryKey: ['student-unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });

  const upcoming = useMemo(() => {
    const rows = enrollmentsQuery.data ?? [];
    return rows
      .flatMap((item) =>
        (item.session ?? []).map((session) => ({
          enrollmentId: item.id,
          groupName: item.group?.name ?? 'Group',
          scheduledAt: session.scheduled_start_at,
        }))
      )
      .filter((item) => item.scheduledAt)
      .sort((a, b) => new Date(a.scheduledAt as string).getTime() - new Date(b.scheduledAt as string).getTime())
      .slice(0, 8);
  }, [enrollmentsQuery.data]);

  const groups = useMemo(() => {
    const map = new Map<string, string>();
    for (const enrollment of enrollmentsQuery.data ?? []) {
      if (enrollment.group?.id) map.set(enrollment.group.id, enrollment.group.name ?? 'Group');
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [enrollmentsQuery.data]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('upcoming')}
          className={`rounded-lg px-3 py-2 text-sm ${tab === 'upcoming' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Upcoming Sessions
        </button>
        {groupsOn && (
          <button
            type="button"
            onClick={() => setTab('groups')}
            className={`rounded-lg px-3 py-2 text-sm ${tab === 'groups' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            My Groups
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`rounded-lg px-3 py-2 text-sm ${tab === 'notifications' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Notifications {unreadQuery.data ? `(${unreadQuery.data})` : ''}
        </button>
      </div>

      {tab === 'upcoming' && (
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-600">No upcoming group sessions.</p>
          ) : (
            upcoming.map((session) => (
              <div key={`${session.enrollmentId}-${session.scheduledAt}`} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-900">{session.groupName}</p>
                <p className="text-sm text-gray-600">{new Date(session.scheduledAt as string).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      )}

      {groupsOn && tab === 'groups' && (
        <div className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-600">You are not enrolled in any groups yet.</p>
          ) : (
            groups.map((group) => (
              <a key={group.id} href={`/student/groups/${group.id}`} className="block rounded-lg border border-gray-200 p-3 text-sm text-gray-800 hover:border-blue-300">
                {group.name}
              </a>
            ))
          )}
        </div>
      )}

      {tab === 'notifications' && <NotificationsList />}
    </div>
  );
}


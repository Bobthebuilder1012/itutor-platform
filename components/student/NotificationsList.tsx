'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
};

async function fetchNotifications(): Promise<NotificationItem[]> {
  const res = await fetch('/api/notifications?limit=20', { cache: 'no-store' });
  const payload = await res.json();
  if (!res.ok || payload?.success === false) throw new Error(payload?.error ?? 'Failed to load notifications');
  return payload?.data?.items ?? [];
}

export default function NotificationsList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['student-notifications'], queryFn: fetchNotifications });

  async function markRead(notificationId: string) {
    await fetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
    queryClient.invalidateQueries({ queryKey: ['student-notifications'] });
    queryClient.invalidateQueries({ queryKey: ['student-unread-count'] });
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' });
    queryClient.invalidateQueries({ queryKey: ['student-notifications'] });
    queryClient.invalidateQueries({ queryKey: ['student-unread-count'] });
  }

  if (isLoading) return <p className="text-sm text-gray-600">Loading notifications...</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-700">
          Mark all read
        </button>
      </div>
      {(data ?? []).length === 0 ? (
        <p className="text-sm text-gray-600">No notifications yet.</p>
      ) : (
        (data ?? []).map((notification) => (
          <button
            key={notification.id}
            type="button"
            onClick={() => markRead(notification.id)}
            className={`w-full rounded-xl border p-3 text-left ${
              notification.is_read ? 'border-gray-200 bg-white' : 'border-blue-200 bg-blue-50'
            }`}
          >
            <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
            <p className="mt-1 text-sm text-gray-700">{notification.message}</p>
            <p className="mt-1 text-xs text-gray-500">{new Date(notification.created_at).toLocaleString()}</p>
          </button>
        ))
      )}
    </div>
  );
}


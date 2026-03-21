'use client';

import { useState } from 'react';

type EnrollmentType = 'SUBSCRIPTION' | 'SINGLE_SESSION';

export default function EnrollmentModal({
  open,
  onClose,
  groupId,
  sessions,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  sessions: Array<{ id: string; scheduledAt: string }>;
  onSuccess?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollmentType, setEnrollmentType] = useState<EnrollmentType>('SUBSCRIPTION');
  const [sessionId, setSessionId] = useState<string>('');

  if (!open) return null;

  async function handleEnroll() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentType,
          sessionId: enrollmentType === 'SINGLE_SESSION' ? sessionId : undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Failed to enroll');
      }
      onSuccess?.();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to enroll');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Join Group</h3>
        <p className="mt-1 text-sm text-gray-600">Choose how you want to enroll.</p>

        <div className="mt-4 space-y-2">
          <button
            className={`w-full rounded-lg border px-3 py-2 text-sm ${enrollmentType === 'SUBSCRIPTION' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700'}`}
            onClick={() => setEnrollmentType('SUBSCRIPTION')}
          >
            Monthly Subscription
          </button>
          <button
            className={`w-full rounded-lg border px-3 py-2 text-sm ${enrollmentType === 'SINGLE_SESSION' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700'}`}
            onClick={() => setEnrollmentType('SINGLE_SESSION')}
          >
            Single Session
          </button>
        </div>

        {enrollmentType === 'SINGLE_SESSION' && (
          <select
            className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">Select session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {new Date(session.scheduledAt).toLocaleString()}
              </option>
            ))}
          </select>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={handleEnroll}
            disabled={loading || (enrollmentType === 'SINGLE_SESSION' && !sessionId)}
          >
            {loading ? 'Enrolling...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}


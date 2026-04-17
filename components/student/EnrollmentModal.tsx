'use client';

import { useEffect, useMemo, useState } from 'react';

type EnrollmentType = 'SUBSCRIPTION' | 'SINGLE_SESSION';

export default function EnrollmentModal({
  open,
  groupId,
  sessions,
  onClose,
  onSuccess,
}: {
  open: boolean;
  groupId: string;
  sessions: Array<{ id: string; scheduled_start_at: string }>;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [mode, setMode] = useState<EnrollmentType>('SUBSCRIPTION');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime()),
    [sessions]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  if (!open) return null;

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentType: mode,
          sessionId: mode === 'SINGLE_SESSION' ? sessionId : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error ?? 'Failed to enroll');
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to enroll');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Choose enrollment plan</h3>
        <p className="mt-1 text-sm text-gray-600">Pick a monthly subscription or join one session.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode('SUBSCRIPTION')}
            className={`rounded-lg border px-3 py-2 text-sm ${mode === 'SUBSCRIPTION' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setMode('SINGLE_SESSION')}
            className={`rounded-lg border px-3 py-2 text-sm ${mode === 'SINGLE_SESSION' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700'}`}
          >
            Single session
          </button>
        </div>

        {mode === 'SINGLE_SESSION' && (
          <select
            className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">Select a session</option>
            {sortedSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {new Date(session.scheduled_start_at).toLocaleString()}
              </option>
            ))}
          </select>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading || (mode === 'SINGLE_SESSION' && !sessionId)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Joining...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}


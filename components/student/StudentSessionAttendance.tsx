'use client';

import { useEffect, useState } from 'react';
import {
  attendanceClosedReason,
  canEditAttendanceNow,
  type SelfReportedAttendanceStatus,
} from '@/lib/utils/sessionAttendance';

export type SessionAttendanceState = {
  status: SelfReportedAttendanceStatus;
  updatedAt: string;
} | null;

type Props = {
  sessionId: string;
  scheduledStartAt: string;
  sessionStatus: string;
  attendance: SessionAttendanceState;
  compact?: boolean;
  onUpdated?: () => void;
};

export default function StudentSessionAttendance({
  sessionId,
  scheduledStartAt,
  sessionStatus,
  attendance: initialAttendance,
  compact,
  onUpdated,
}: Props) {
  const [attendance, setAttendance] = useState<SessionAttendanceState>(initialAttendance);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAttendance(initialAttendance);
  }, [initialAttendance, sessionId]);

  const schedOk = ['SCHEDULED', 'JOIN_OPEN'].includes(sessionStatus);
  const editable = schedOk && canEditAttendanceNow(scheduledStartAt);

  const save = async (status: SelfReportedAttendanceStatus) => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/student/sessions/${sessionId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save');
        return;
      }
      if (data.attendance) {
        setAttendance({ status: data.attendance.status, updatedAt: data.attendance.updatedAt });
      }
      onUpdated?.();
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/student/sessions/${sessionId}/attendance`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not clear');
        return;
      }
      setAttendance(null);
      onUpdated?.();
    } finally {
      setSaving(false);
    }
  };

  const label =
    attendance?.status === 'attending'
      ? 'You marked: attending'
      : attendance?.status === 'not_attending'
        ? 'You marked: not attending'
        : 'No response yet';

  const updated =
    attendance?.updatedAt &&
    new Date(attendance.updatedAt).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const wrap = compact ? 'mt-3 pt-3 border-t border-gray-200' : 'mt-4 rounded-xl border border-gray-200 bg-white p-4';

  return (
    <div className={wrap}>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Your attendance</p>
      <p className="mt-1 text-sm font-medium text-gray-800">{label}</p>
      {updated && <p className="text-xs text-gray-500">Updated {updated}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {editable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => save('attending')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              attendance?.status === 'attending'
                ? 'bg-itutor-green text-black ring-2 ring-itutor-green ring-offset-1'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            } disabled:opacity-50`}
          >
            I&apos;ll attend
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => save('not_attending')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              attendance?.status === 'not_attending'
                ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-400 ring-offset-1'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            } disabled:opacity-50`}
          >
            I won&apos;t attend
          </button>
          {attendance && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void clear()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Clear response
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-500">
          {!schedOk
            ? 'Attendance responses are only available before the session completes or is cancelled.'
            : attendanceClosedReason(scheduledStartAt)}
        </p>
      )}
    </div>
  );
}

export function ParentAttendanceReadOnly({
  attendance,
}: {
  attendance: { status: SelfReportedAttendanceStatus; updatedAt: string } | null | undefined;
}) {
  if (!attendance) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" aria-hidden />
        Has not responded yet
      </div>
    );
  }

  const isAttending = attendance.status === 'attending';
  return (
    <div className="mt-2 space-y-0.5">
      <div
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
          isAttending ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isAttending ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden />
        {isAttending ? 'Plans to attend' : 'Marked not attending'}
      </div>
      <p className="text-[11px] text-gray-500">
        Self-reported{' '}
        {new Date(attendance.updatedAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </p>
    </div>
  );
}

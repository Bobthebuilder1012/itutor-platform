/**
 * Self-reported attendance: optional stricter deadline before session start.
 * DB RLS allows edits until scheduled_start_at; this narrows the window when env is set.
 * Use NEXT_PUBLIC_* so client and API share the same value at build/runtime.
 */
export function attendanceDeadlineHoursBeforeStart(): number {
  const raw =
    process.env.NEXT_PUBLIC_SESSION_ATTENDANCE_DEADLINE_HOURS_BEFORE_START ??
    process.env.SESSION_ATTENDANCE_DEADLINE_HOURS_BEFORE_START;
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 168);
}

export function getAttendanceEditDeadlineIso(scheduledStartAt: string | Date): string {
  const start = typeof scheduledStartAt === 'string' ? new Date(scheduledStartAt) : scheduledStartAt;
  const ms = start.getTime() - attendanceDeadlineHoursBeforeStart() * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export function canEditAttendanceNow(scheduledStartAt: string | Date): boolean {
  return Date.now() < new Date(getAttendanceEditDeadlineIso(scheduledStartAt)).getTime();
}

export function attendanceClosedReason(scheduledStartAt: string | Date): string {
  const hours = attendanceDeadlineHoursBeforeStart();
  if (hours <= 0) {
    return 'You can no longer change this after the session start time.';
  }
  return `You can no longer change this within ${hours} hour${hours === 1 ? '' : 's'} of the session start.`;
}

export type SelfReportedAttendanceStatus = 'attending' | 'not_attending';

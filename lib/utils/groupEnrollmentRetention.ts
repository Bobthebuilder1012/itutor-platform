export type EnrollmentRetentionRow = {
  student_id: string;
  session_id: string | null;
  enrolled_at: string;
  updated_at: string;
  status: string;
};

export type MonthlyEnrollmentRetentionPoint = {
  year: number;
  month: number;
  monthLabel: string;
  startCount: number;
  endCount: number;
  changePercent: number | null;
  retentionPercent: number | null;
};

function parseInstant(iso: string): Date {
  return new Date(iso);
}

/** Class-level (subscription) enrollment active at instant T; uses updated_at as proxy for last status change. */
export function isClassEnrollmentActiveAtInstant(row: EnrollmentRetentionRow, instant: Date): boolean {
  if (row.session_id != null) return false;
  if (parseInstant(row.enrolled_at) > instant) return false;
  if (row.status === 'WAITLISTED') return false;
  if (row.status === 'ACTIVE') return true;
  return parseInstant(row.updated_at) > instant;
}

export function countDistinctStudentsEnrolledAtInstant(rows: EnrollmentRetentionRow[], instant: Date): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (isClassEnrollmentActiveAtInstant(row, instant)) ids.add(row.student_id);
  }
  return ids.size;
}

export function buildMonthlyEnrollmentRetentionSeries(
  rows: EnrollmentRetentionRow[],
  monthsBack: number,
  now: Date = new Date()
): MonthlyEnrollmentRetentionPoint[] {
  const capped = Math.min(Math.max(monthsBack, 1), 36);
  const y = now.getUTCFullYear();
  const m0 = now.getUTCMonth();
  const series: MonthlyEnrollmentRetentionPoint[] = [];

  const iter = new Date(Date.UTC(y, m0 - (capped - 1), 1));
  for (let i = 0; i < capped; i++) {
    const year = iter.getUTCFullYear();
    const monthIndex = iter.getUTCMonth();
    const monthStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

    const startCount = countDistinctStudentsEnrolledAtInstant(rows, monthStart);
    const endCount = countDistinctStudentsEnrolledAtInstant(rows, monthEnd);

    let changePercent: number | null = null;
    let retentionPercent: number | null = null;
    if (startCount > 0) {
      changePercent = Number((((endCount - startCount) / startCount) * 100).toFixed(1));
      retentionPercent = Number(((endCount / startCount) * 100).toFixed(1));
    }

    series.push({
      year,
      month: monthIndex + 1,
      monthLabel: monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      startCount,
      endCount,
      changePercent,
      retentionPercent,
    });

    iter.setUTCMonth(iter.getUTCMonth() + 1);
  }

  return series;
}

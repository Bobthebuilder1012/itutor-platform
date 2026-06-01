export type ScheduleEntry = { day: number; time: string; durationMin: number };

const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export function formatTimeRange(time: string, durationMin: number): string {
  const [hh, mm] = time.split(':').map(Number);
  const startTotalMin = hh * 60 + mm;
  const endTotalMin = startTotalMin + durationMin;

  const fmt = (totalMin: number, showPeriod: boolean) => {
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const mStr = m.toString().padStart(2, '0');
    return showPeriod ? `${h12}:${mStr} ${period}` : `${h12}:${mStr}`;
  };

  const startPeriod = hh >= 12 ? 'PM' : 'AM';
  const endH = Math.floor(endTotalMin / 60) % 24;
  const endPeriod = endH >= 12 ? 'PM' : 'AM';

  if (startPeriod === endPeriod) {
    return `${fmt(startTotalMin, false)}–${fmt(endTotalMin, true)} AST`;
  }
  return `${fmt(startTotalMin, true)}–${fmt(endTotalMin, true)} AST`;
}

export function formatScheduleEntry(e: ScheduleEntry): string {
  return `${DAY_PLURAL[e.day]} · ${formatTimeRange(e.time, e.durationMin)}`;
}

export function scheduleToDisplay(entries: ScheduleEntry[]): string {
  return entries.map(formatScheduleEntry).join('\n');
}

export function parseScheduleData(raw: string | null | undefined): ScheduleEntry[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

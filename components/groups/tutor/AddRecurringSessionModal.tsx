'use client';

import { useEffect, useMemo, useState } from 'react';

interface AddRecurringSessionModalProps {
  groupId: string;
  onCreated: () => void;
  onClose: () => void;
}

type RecType = 'daily' | 'weekly' | 'monthly';
type EndsType = 'never' | 'date' | 'count';
type DropType = 'startCal' | 'endCal' | 'startTime' | 'endTime' | null;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function allTimes(): { label: string; totalMin: number }[] {
  const list: { label: string; totalMin: number }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const ampm = h < 12 ? 'AM' : 'PM';
      const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
      list.push({ label: `${hr}:${m === 0 ? '00' : m} ${ampm}`, totalMin: h * 60 + m });
    }
  }
  return list;
}

function minToLabel(t: number): string {
  t = ((t % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60), m = t % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${m === 0 ? '00' : m} ${ampm}`;
}

function durLabel(mins: number): string {
  if (mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), r = mins % 60;
  if (r === 0) return h === 1 ? '1 hr' : `${h} hrs`;
  return `${h} hr ${r} min`;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabelLong(d: Date): string {
  return `${DAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function countOccurrences(startDate: Date, endDate: Date | null, recType: RecType, days: number[], count: number | null, endsType: EndsType): number {
  if (endsType === 'count') return count ?? 0;
  if (endsType === 'never') return 52; // placeholder for display
  if (!endDate) return 0;
  let n = 0;
  const cursor = new Date(startDate);
  const limit = new Date(endDate);
  limit.setHours(23, 59, 59);
  while (cursor <= limit && n < 500) {
    if (recType === 'daily') { n++; cursor.setDate(cursor.getDate() + 1); }
    else if (recType === 'weekly') {
      if (days.includes(cursor.getDay())) n++;
      cursor.setDate(cursor.getDate() + 1);
    } else if (recType === 'monthly') {
      n++;
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return n;
}

const TIMES = allTimes();

export default function AddRecurringSessionModal({ groupId, onCreated, onClose }: AddRecurringSessionModalProps) {
  const today = new Date();

  const [recType, setRecType] = useState<RecType>('weekly');
  const [activeDays, setActiveDays] = useState<number[]>([today.getDay()]);
  const [startMin, setStartMin] = useState(9 * 60);
  const [endMin, setEndMin] = useState(10 * 60);
  const [openDrop, setOpenDrop] = useState<DropType>(null);

  const [startDate, setStartDate] = useState<Date>(today);
  const [startCalYear, setStartCalYear] = useState(today.getFullYear());
  const [startCalMonth, setStartCalMonth] = useState(today.getMonth());

  const [endsType, setEndsType] = useState<EndsType>('date');
  const [endDate, setEndDate] = useState<Date>(() => { const d = new Date(today); d.setMonth(d.getMonth() + 2); return d; });
  const [endCalYear, setEndCalYear] = useState(() => { const d = new Date(today); d.setMonth(d.getMonth() + 2); return d.getFullYear(); });
  const [endCalMonth, setEndCalMonth] = useState(() => { const d = new Date(today); d.setMonth(d.getMonth() + 2); return d.getMonth(); });
  const [sessionCount, setSessionCount] = useState(10);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const diffMin = ((endMin - startMin) + 1440) % 1440;
  const over5h = diffMin > 300;

  const previewCount = useMemo(() => {
    if (recType === 'weekly' && activeDays.length === 0) return 0;
    return countOccurrences(startDate, endsType === 'date' ? endDate : null, recType, activeDays, sessionCount, endsType);
  }, [recType, activeDays, startDate, endDate, sessionCount, endsType]);

  useEffect(() => {
    const h = () => setOpenDrop(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();
  const toggleDay = (d: number) => setActiveDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());

  const handleSubmit = async () => {
    if (over5h || diffMin <= 0) return;
    if (recType === 'weekly' && activeDays.length === 0) { setError('Select at least one day'); return; }
    setSubmitting(true);
    setError('');
    try {
      const startH = Math.floor(startMin / 60);
      const startM = startMin % 60;
      const startTimeStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;

      const payload: any = {
        title: `Recurring ${recType} session`,
        recurrence_type: recType,
        recurrence_days: recType === 'weekly' ? activeDays : [],
        start_time: startTimeStr,
        duration_minutes: diffMin,
        starts_on: toYMD(startDate),
        timezone_offset: new Date().getTimezoneOffset(),
      };

      if (endsType === 'date') payload.ends_on = toYMD(endDate);
      else if (endsType === 'count') payload.max_occurrences = sessionCount;

      const res = await fetch(`/api/groups/${groupId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to create sessions');
      }
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const pillStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', background: '#f3f4f6',
    border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '6px 12px',
    fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer',
    userSelect: 'none', position: 'relative', flexShrink: 0,
  };

  const renderCalGrid = (year: number, month: number, selected: Date, onSelect: (d: Date) => void) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: React.ReactNode[] = [];
    DAYS_SHORT.forEach((d) => cells.push(
      <div key={`h-${d}`} style={{ fontWeight: 700, color: '#6b7280', padding: '5px 0', fontSize: 11, textAlign: 'center' }}>{d}</div>
    ));
    for (let i = 0; i < firstDay; i++) cells.push(<div key={`e-${i}`} />);
    for (let day = 1; day <= daysInMonth; day++) {
      const isSel = selected.getDate() === day && selected.getMonth() === month && selected.getFullYear() === year;
      const isTod = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
      cells.push(
        <div key={day} onClick={(e) => { e.stopPropagation(); onSelect(new Date(year, month, day)); setOpenDrop(null); }}
          style={{ padding: '6px 0', borderRadius: '50%', cursor: 'pointer', textAlign: 'center', fontSize: 12, background: isSel ? '#199356' : 'none', color: isSel ? '#fff' : isTod ? '#199356' : '#374151', fontWeight: isSel || isTod ? 700 : 400 }}>
          {day}
        </div>
      );
    }
    return cells;
  };

  const renderTimeDrop = (type: 'startTime' | 'endTime') => {
    const curMin = type === 'startTime' ? startMin : endMin;
    const curLabel = minToLabel(curMin);
    return TIMES.map((t) => {
      const diff = type === 'endTime' ? ((t.totalMin - startMin) + 1440) % 1440 : 0;
      const isOver = type === 'endTime' && diff > 300;
      const isSel = t.label === curLabel;
      return (
        <div key={t.label}
          onClick={(e) => { e.stopPropagation(); if (isOver) return; if (type === 'startTime') { const od = ((endMin - startMin) + 1440) % 1440 || 60; setStartMin(t.totalMin); setEndMin((t.totalMin + od) % 1440); } else setEndMin(t.totalMin); setOpenDrop(null); }}
          style={{ padding: '8px 12px', borderRadius: 6, fontSize: 14, cursor: isOver ? 'default' : 'pointer', background: isSel ? '#e8f5ee' : 'none', color: isOver ? '#d1d5db' : isSel ? '#137a48' : '#374151', fontWeight: isSel ? 600 : 400 }}
          onMouseEnter={(e) => { if (!isOver && !isSel) (e.currentTarget as HTMLDivElement).style.background = '#f3f4f6'; }}
          onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'none'; }}
        >
          {t.label}
        </div>
      );
    });
  };

  const previewText = (() => {
    const daysStr = recType === 'weekly' && activeDays.length > 0 ? activeDays.map((d) => DAY_NAMES[d]).join(', ') : recType === 'daily' ? 'Every day' : 'Monthly';
    const timeStr = `${minToLabel(startMin)} – ${minToLabel(endMin)}`;
    const rangeStr = endsType === 'never' ? `${dateLabelLong(startDate)} onwards` : endsType === 'count' ? `${sessionCount} sessions starting ${dateLabelLong(startDate)}` : `${MONTHS_SHORT[startDate.getMonth()]} ${startDate.getDate()} → ${MONTHS_SHORT[endDate.getMonth()]} ${endDate.getDate()}`;
    return `${daysStr} · ${timeStr} · ${rangeStr}`;
  })();

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div onClick={stopProp} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden', margin: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>Add Recurring Session</h3>
              <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Schedule a repeating session for this lesson</p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: '70vh' }}>
          {error && <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}

          {/* Recurrence type */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Recurrence</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['daily', 'weekly', 'monthly'] as RecType[]).map((rt) => {
                const active = recType === rt;
                return (
                  <button key={rt} onClick={() => setRecType(rt)}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, border: active ? 'none' : '1.5px solid #e5e7eb', background: active ? '#199356' : '#fff', color: active ? '#fff' : '#374151', cursor: 'pointer', textTransform: 'capitalize' }}>
                    {rt.charAt(0).toUpperCase() + rt.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day pills (weekly only) */}
          {recType === 'weekly' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Repeat on</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {DAY_NAMES.map((d, i) => {
                  const active = activeDays.includes(i);
                  return (
                    <button key={d} onClick={() => toggleDay(i)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, border: active ? 'none' : '1.5px solid #e5e7eb', background: active ? '#199356' : '#fff', color: active ? '#fff' : '#6b7280', cursor: 'pointer' }}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time row */}
          <div style={{ marginBottom: over5h ? 0 : 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Time</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>

              {/* Start time */}
              <div style={pillStyle} onClick={(e) => { e.stopPropagation(); setOpenDrop(openDrop === 'startTime' ? null : 'startTime'); }}>
                <span>{minToLabel(startMin)}</span>
                {openDrop === 'startTime' && (
                  <div onClick={stopProp} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', width: 140, maxHeight: 220, overflowY: 'auto', zIndex: 200, padding: 4 }}>
                    {renderTimeDrop('startTime')}
                  </div>
                )}
              </div>

              <span style={{ color: '#6b7280' }}>–</span>

              {/* End time */}
              <div style={pillStyle} onClick={(e) => { e.stopPropagation(); setOpenDrop(openDrop === 'endTime' ? null : 'endTime'); }}>
                <span>{minToLabel(endMin)}</span>
                {openDrop === 'endTime' && (
                  <div onClick={stopProp} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', width: 140, maxHeight: 220, overflowY: 'auto', zIndex: 200, padding: 4 }}>
                    {renderTimeDrop('endTime')}
                  </div>
                )}
              </div>

              {/* Duration badge */}
              <span style={{ background: over5h ? '#fee2e2' : '#f3f4f6', color: over5h ? '#dc2626' : '#6b7280', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                {diffMin > 0 ? durLabel(diffMin) : '—'}
              </span>
            </div>
            {over5h && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 10 }}>
                ⚠ Session cannot be longer than 5 hours
              </div>
            )}
          </div>

          {/* Start date + Ends */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, marginTop: over5h ? 12 : 0 }}>
            {/* Starts on */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Starts on</label>
              <div style={{ ...pillStyle, display: 'block' as any, textAlign: 'left' }} onClick={(e) => { e.stopPropagation(); setOpenDrop(openDrop === 'startCal' ? null : 'startCal'); }}>
                <span style={{ fontSize: 13 }}>{dateLabelLong(startDate)}</span>
                {openDrop === 'startCal' && (
                  <div onClick={stopProp} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 16, zIndex: 200, minWidth: 280 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <button onClick={(e) => { e.stopPropagation(); setStartCalMonth((m) => { const nm = m - 1; if (nm < 0) { setStartCalYear((y) => y - 1); return 11; } return nm; }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '4px 8px' }}>‹</button>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{MONTHS[startCalMonth]} {startCalYear}</span>
                      <button onClick={(e) => { e.stopPropagation(); setStartCalMonth((m) => { const nm = m + 1; if (nm > 11) { setStartCalYear((y) => y + 1); return 0; } return nm; }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '4px 8px' }}>›</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>{renderCalGrid(startCalYear, startCalMonth, startDate, setStartDate)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Ends */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Ends</label>
              <select value={endsType} onChange={(e) => setEndsType(e.target.value as EndsType)}
                style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#374151', background: '#f3f4f6', cursor: 'pointer' }}>
                <option value="never">Never</option>
                <option value="date">On a date</option>
                <option value="count">After N sessions</option>
              </select>
            </div>
          </div>

          {/* End date picker */}
          {endsType === 'date' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>End date</label>
              <div style={{ ...pillStyle, display: 'inline-block' as any }} onClick={(e) => { e.stopPropagation(); setOpenDrop(openDrop === 'endCal' ? null : 'endCal'); }}>
                <span style={{ fontSize: 13 }}>{dateLabelLong(endDate)}</span>
                {openDrop === 'endCal' && (
                  <div onClick={stopProp} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 16, zIndex: 200, minWidth: 280 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <button onClick={(e) => { e.stopPropagation(); setEndCalMonth((m) => { const nm = m - 1; if (nm < 0) { setEndCalYear((y) => y - 1); return 11; } return nm; }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '4px 8px' }}>‹</button>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{MONTHS[endCalMonth]} {endCalYear}</span>
                      <button onClick={(e) => { e.stopPropagation(); setEndCalMonth((m) => { const nm = m + 1; if (nm > 11) { setEndCalYear((y) => y + 1); return 0; } return nm; }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '4px 8px' }}>›</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>{renderCalGrid(endCalYear, endCalMonth, endDate, setEndDate)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* After N sessions */}
          {endsType === 'count' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Number of sessions</label>
              <input type="number" value={sessionCount} onChange={(e) => setSessionCount(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))} min={1} max={200}
                style={{ padding: '9px 14px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 140, boxSizing: 'border-box' }} />
            </div>
          )}

          {/* Preview */}
          <div style={{ background: '#e8f5ee', border: '1px solid #c7e6d4', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#199358" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#137a48' }}>
                Preview — {previewCount > 0 ? `${previewCount}${endsType === 'never' ? '+' : ''} session${previewCount !== 1 ? 's' : ''} will be created` : 'No sessions selected'}
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#137a48', margin: 0 }}>{previewText}</p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 20px', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={over5h || diffMin <= 0 || (recType === 'weekly' && activeDays.length === 0) || submitting}
            style={{ background: '#199356', border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: (over5h || diffMin <= 0 || (recType === 'weekly' && activeDays.length === 0)) ? 0.5 : 1 }}
          >
            {submitting ? 'Creating…' : 'Create sessions'}
          </button>
        </div>
      </div>
    </div>
  );
}

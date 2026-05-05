'use client';

import { useEffect, useRef, useState } from 'react';

interface AddSessionModalProps {
  groupId: string;
  onCreated: () => void;
  onClose: () => void;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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

function timeToMin(label: string): number {
  const [time, ampm] = label.split(' ');
  let [h, m] = time!.split(':').map(Number);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + m!;
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

function dateLabel(d: Date): string {
  return `${DAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type DropType = 'cal' | 'start' | 'end' | null;

export default function AddSessionModal({ groupId, onCreated, onClose }: AddSessionModalProps) {
  const today = new Date();
  const [sessionTitle, setSessionTitle] = useState('');
  const [selDate, setSelDate] = useState<Date>(today);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [startMin, setStartMin] = useState(9 * 60); // 9:00 AM
  const [endMin, setEndMin] = useState(10 * 60);     // 10:00 AM
  const [openDrop, setOpenDrop] = useState<DropType>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const TIMES = allTimes();
  const diffMin = ((endMin - startMin) + 1440) % 1440;
  const over5h = diffMin > 300;
  const canCreate = !!sessionTitle.trim() && !over5h && diffMin > 0;

  useEffect(() => {
    const handler = () => setOpenDrop(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  const handleSubmit = async () => {
    if (!canCreate) return;
    setSubmitting(true);
    setError('');
    try {
      const startH = Math.floor(startMin / 60);
      const startM = startMin % 60;
      const startTimeStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
      const res = await fetch(`/api/groups/${groupId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sessionTitle.trim(),
          recurrence_type: 'none',
          start_time: startTimeStr,
          duration_minutes: diffMin,
          starts_on: toYMD(selDate),
          timezone_offset: new Date().getTimezoneOffset(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to create session');
      }
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Calendar grid
  const renderCal = () => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: React.ReactNode[] = [];
    DAYS_SHORT.forEach((d) => (
      cells.push(<div key={`h-${d}`} style={{ fontWeight: 700, color: '#6b7280', padding: '5px 0', fontSize: 11, textAlign: 'center' }}>{d}</div>)
    ));
    for (let i = 0; i < firstDay; i++) cells.push(<div key={`e-${i}`} />);
    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected = selDate.getDate() === day && selDate.getMonth() === calMonth && selDate.getFullYear() === calYear;
      const isToday = today.getDate() === day && today.getMonth() === calMonth && today.getFullYear() === calYear;
      cells.push(
        <div
          key={day}
          onClick={(e) => { e.stopPropagation(); setSelDate(new Date(calYear, calMonth, day)); setOpenDrop(null); }}
          style={{
            padding: '6px 0', borderRadius: '50%', cursor: 'pointer', textAlign: 'center', fontSize: 12,
            background: isSelected ? '#199356' : 'none',
            color: isSelected ? '#fff' : isToday ? '#199356' : '#374151',
            fontWeight: isSelected || isToday ? 700 : 400,
          }}
        >
          {day}
        </div>
      );
    }
    return cells;
  };

  // Time dropdown
  const renderTimeDrop = (type: 'start' | 'end') => {
    const currentMin = type === 'start' ? startMin : endMin;
    const currentLabel = minToLabel(currentMin);
    return TIMES.map((t) => {
      const diff = type === 'end' ? ((t.totalMin - startMin) + 1440) % 1440 : 0;
      const isOver = type === 'end' && diff > 300;
      const isSelected = t.label === currentLabel;
      return (
        <div
          key={t.label}
          onClick={(e) => {
            e.stopPropagation();
            if (isOver) return;
            if (type === 'start') {
              const oldDiff = ((endMin - startMin) + 1440) % 1440 || 60;
              setStartMin(t.totalMin);
              setEndMin((t.totalMin + oldDiff) % 1440);
            } else {
              setEndMin(t.totalMin);
            }
            setOpenDrop(null);
          }}
          style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 14, cursor: isOver ? 'default' : 'pointer',
            background: isSelected ? '#e8f5ee' : 'none',
            color: isOver ? '#d1d5db' : isSelected ? '#137a48' : '#374151',
            fontWeight: isSelected ? 600 : 400,
          }}
          onMouseEnter={(e) => { if (!isOver && !isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f3f4f6'; }}
          onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'none'; }}
        >
          {t.label}
        </div>
      );
    });
  };

  const pillStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: '#f3f4f6', border: '1.5px solid #e5e7eb', borderRadius: 8,
    padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#374151',
    cursor: 'pointer', userSelect: 'none', position: 'relative', flexShrink: 0,
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={stopProp}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>Add Session</h3>
              <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Schedule a one-time session for this lesson</p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 8px', overflowY: 'auto', maxHeight: '65vh' }}>
          {error && <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}

          {/* Session title */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Session title</label>
            <input
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder="e.g. Week 6 — Energy & Work"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
              onFocus={(e) => (e.target.style.borderColor = '#199356')}
              onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
            />
          </div>

          {/* Date & time row */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10 }}>Date & time</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
              {/* Clock icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>

              {/* Date pill */}
              <div
                style={pillStyle}
                onClick={(e) => { e.stopPropagation(); setOpenDrop(openDrop === 'cal' ? null : 'cal'); }}
              >
                <span>{dateLabel(selDate)}</span>
                {openDrop === 'cal' && (
                  <div
                    onClick={stopProp}
                    style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 16, zIndex: 200, minWidth: 280 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <button onClick={(e) => { e.stopPropagation(); setCalMonth((m) => { const nm = m - 1; if (nm < 0) { setCalYear((y) => y - 1); return 11; } return nm; }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '4px 8px' }}>‹</button>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{MONTHS[calMonth]} {calYear}</span>
                      <button onClick={(e) => { e.stopPropagation(); setCalMonth((m) => { const nm = m + 1; if (nm > 11) { setCalYear((y) => y + 1); return 0; } return nm; }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '4px 8px' }}>›</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>{renderCal()}</div>
                  </div>
                )}
              </div>

              {/* Start time pill */}
              <div
                style={pillStyle}
                onClick={(e) => { e.stopPropagation(); setOpenDrop(openDrop === 'start' ? null : 'start'); }}
              >
                <span>{minToLabel(startMin)}</span>
                {openDrop === 'start' && (
                  <div
                    ref={(el) => { if (el && openDrop === 'start') el.scrollTop = Math.max(0, (startMin / 15) * 36 - 90); }}
                    onClick={stopProp}
                    style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', width: 140, maxHeight: 220, overflowY: 'auto', zIndex: 200, padding: 4 }}
                  >
                    {renderTimeDrop('start')}
                  </div>
                )}
              </div>

              <span style={{ color: '#6b7280', fontWeight: 500 }}>–</span>

              {/* End time pill */}
              <div
                style={pillStyle}
                onClick={(e) => { e.stopPropagation(); setOpenDrop(openDrop === 'end' ? null : 'end'); }}
              >
                <span>{minToLabel(endMin)}</span>
                {openDrop === 'end' && (
                  <div
                    ref={(el) => { if (el && openDrop === 'end') el.scrollTop = Math.max(0, (endMin / 15) * 36 - 90); }}
                    onClick={stopProp}
                    style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', width: 140, maxHeight: 220, overflowY: 'auto', zIndex: 200, padding: 4 }}
                  >
                    {renderTimeDrop('end')}
                  </div>
                )}
              </div>

              {/* Duration badge */}
              <span style={{
                background: over5h ? '#fee2e2' : '#f3f4f6',
                color: over5h ? '#dc2626' : '#6b7280',
                padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              }}>
                {diffMin > 0 ? durLabel(diffMin) : '—'}
              </span>
            </div>

            {/* 5hr error */}
            {over5h && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 10 }}>
                ⚠ Session cannot be longer than 5 hours
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 20px', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canCreate || submitting}
            style={{
              background: canCreate ? '#199356' : '#a7d7be', border: 'none', borderRadius: 10, padding: '9px 20px',
              fontSize: 14, fontWeight: 600, color: '#fff', cursor: canCreate ? 'pointer' : 'not-allowed',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Creating…' : 'Create session'}
          </button>
        </div>
      </div>
    </div>
  );
}

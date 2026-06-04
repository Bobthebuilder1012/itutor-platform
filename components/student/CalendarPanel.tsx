'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { UPCOMING_EVENTS } from '@/lib/student-store';
import { cn } from '@/lib/utils';

const DAYS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const GUTTER = 48;

const COLOR_MAP: Record<string, string> = {
  coral: 'bg-coral/15 border-coral text-coral',
  sky: 'bg-sky border-sky/60 text-ink',
  lavender: 'bg-lavender border-lavender/70 text-ink',
  peach: 'bg-peach border-peach/70 text-ink',
  brand: 'bg-brand-soft border-brand text-forest',
};

export type CalView = 'day' | 'week' | 'month' | 'year';

function fmtHour(h: number) {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function TimeGrid({ days, anchor, rowHeight = 48 }: { days: number; anchor: Date; rowHeight?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const dates = Array.from({ length: days }, (_, i) => addDays(anchor, i));

  useEffect(() => {
    if (!scrollRef.current) return;
    const h = new Date().getHours();
    scrollRef.current.scrollTop = Math.max(0, (h - 1) * rowHeight);
  }, [rowHeight]);

  const visibleEvents = useMemo(() => {
    return UPCOMING_EVENTS.map((e) => {
      const idx = dates.findIndex((d) => d.getDay() === e.day);
      return idx >= 0 ? { ...e, _col: idx } : null;
    }).filter(Boolean) as (typeof UPCOMING_EVENTS[number] & { _col: number })[];
  }, [dates]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex border-b border-border bg-background">
        <div style={{ width: GUTTER }} className="flex-shrink-0" />
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
          {dates.map((d, i) => {
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div key={i} className="text-center py-2 border-l border-border first:border-l-0">
                <div className={cn('text-[10px] font-semibold tracking-wider uppercase', isToday ? 'text-brand-deep' : 'text-muted-foreground')}>
                  {DAYS_FULL[d.getDay()]}
                </div>
                <div className={cn('text-base font-bold mt-0.5 mx-auto', isToday && 'size-7 rounded-full bg-brand text-white grid place-items-center')}>
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="flex relative">
          <div className="flex-shrink-0" style={{ width: GUTTER }}>
            {HOURS.map((h) => (
              <div key={h} className="relative border-t border-border" style={{ height: rowHeight }}>
                <span className="absolute -top-2 right-1.5 text-[10px] text-muted-foreground bg-background px-0.5">
                  {h === 0 ? '' : fmtHour(h)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex-1 relative grid" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
            {dates.map((_, di) => (
              <div key={di} className="border-l border-border first:border-l-0">
                {HOURS.map((h) => (
                  <div key={h} className="border-t border-border" style={{ height: rowHeight }} />
                ))}
              </div>
            ))}

            {visibleEvents.map((e) => {
              const top = e.startHour * rowHeight;
              const height = (e.endHour - e.startHour) * rowHeight - 2;
              return (
                <div
                  key={e.id}
                  className={cn(
                    'absolute rounded-lg border-l-4 p-1.5 text-[11px] shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition',
                    COLOR_MAP[e.color],
                  )}
                  style={{
                    top,
                    height,
                    left: `calc(${(e._col / days) * 100}% + 3px)`,
                    width: `calc(${100 / days}% - 6px)`,
                  }}
                >
                  <div className="font-semibold leading-tight truncate">{e.title}</div>
                  {height > 30 && <div className="opacity-70 truncate text-[10px]">{e.tutor}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ anchor }: { anchor: Date }) {
  const today = new Date();
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  const eventsByDay = useMemo(() => {
    const map = new Map<number, typeof UPCOMING_EVENTS>();
    UPCOMING_EVENTS.forEach((e) => {
      const arr = map.get(e.day) ?? [];
      arr.push(e);
      map.set(e.day, arr);
    });
    return map;
  }, []);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="grid grid-cols-7 border-b border-border">
        {DAYS_FULL.map((d, i) => (
          <div key={i} className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-center py-2 border-l border-border first:border-l-0">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{DAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = d.toDateString() === today.toDateString();
          const evs = eventsByDay.get(d.getDay()) ?? [];
          return (
            <div key={i} className={cn('border-l border-t border-border first:border-l-0 p-1 sm:p-1.5 overflow-hidden', !inMonth && 'bg-muted/30')}>
              <div className={cn('text-xs font-semibold inline-grid place-items-center size-6 rounded-full', isToday ? 'bg-brand text-white' : inMonth ? 'text-ink' : 'text-muted-foreground')}>
                {d.getDate()}
              </div>
              <div className="mt-1 space-y-0.5">
                {inMonth && evs.slice(0, 2).map((e) => (
                  <div key={e.id} className={cn('text-[9px] sm:text-[10px] px-1 py-0.5 rounded truncate border-l-2', COLOR_MAP[e.color])}>
                    {e.title}
                  </div>
                ))}
                {inMonth && evs.length > 2 && <div className="text-[9px] text-muted-foreground">+{evs.length - 2}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearGrid({ anchor, onPick }: { anchor: Date; onPick: (d: Date) => void }) {
  const year = anchor.getFullYear();
  const today = new Date();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-3 overflow-auto h-full">
      {Array.from({ length: 12 }, (_, m) => {
        const first = new Date(year, m, 1);
        const start = startOfWeek(first);
        const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        return (
          <button key={m} onClick={() => onPick(first)} className="text-left rounded-2xl border border-border p-3 hover:shadow-card transition bg-background">
            <div className="text-sm font-semibold text-ink mb-2">{first.toLocaleString('en', { month: 'long' })}</div>
            <div className="grid grid-cols-7 text-[9px] text-muted-foreground mb-1">
              {DAYS_SHORT.map((d, i) => <div key={i} className="text-center">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d, i) => {
                const inMonth = d.getMonth() === m;
                const isToday = d.toDateString() === today.toDateString();
                return (
                  <div key={i} className={cn('text-[9px] text-center aspect-square grid place-items-center rounded-full', isToday && 'bg-brand text-white font-semibold', !inMonth && 'text-muted-foreground/40', inMonth && !isToday && 'text-ink')}>
                    {d.getDate()}
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function CalendarView({ initialView = 'week', onViewChange }: { initialView?: CalView; onViewChange?: (v: CalView) => void }) {
  const [view, setView] = useState<CalView>(initialView);
  const [anchor, setAnchor] = useState<Date>(new Date());

  const setViewWrap = (v: CalView) => {
    setView(v);
    onViewChange?.(v);
  };

  const label = useMemo(() => {
    if (view === 'year') return `${anchor.getFullYear()}`;
    if (view === 'month') return anchor.toLocaleString('en', { month: 'long', year: 'numeric' });
    if (view === 'day') return anchor.toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric' });
    const ws = startOfWeek(anchor);
    const we = addDays(ws, 6);
    return `${ws.toLocaleString('en', { month: 'short', day: 'numeric' })} – ${we.toLocaleString('en', { month: 'short', day: 'numeric' })}`;
  }, [view, anchor]);

  const shift = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + 7 * dir);
    else if (view === 'month') d.setMonth(d.getMonth() + dir);
    else d.setFullYear(d.getFullYear() + dir);
    setAnchor(d);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background flex-wrap">
        <button onClick={() => setAnchor(new Date())} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border hover:bg-muted">
          Today
        </button>
        <div className="flex items-center">
          <button onClick={() => shift(-1)} className="size-8 grid place-items-center rounded-full hover:bg-muted"><ChevronLeft className="size-4" /></button>
          <button onClick={() => shift(1)} className="size-8 grid place-items-center rounded-full hover:bg-muted"><ChevronRight className="size-4" /></button>
        </div>
        <div className="font-semibold text-ink text-sm sm:text-base">{label}</div>
        <div className="ml-auto inline-flex rounded-full bg-muted p-0.5 text-xs font-medium">
          {(['day', 'week', 'month', 'year'] as CalView[]).map((v) => (
            <button
              key={v}
              onClick={() => setViewWrap(v)}
              className={cn('px-2.5 sm:px-3 py-1 rounded-full capitalize transition', view === v ? 'bg-background shadow-sm text-ink' : 'text-muted-foreground hover:text-ink')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'day' && <TimeGrid days={1} anchor={anchor} />}
        {view === 'week' && <TimeGrid days={7} anchor={startOfWeek(anchor)} />}
        {view === 'month' && <MonthGrid anchor={anchor} />}
        {view === 'year' && <YearGrid anchor={anchor} onPick={(d) => { setAnchor(d); setViewWrap('month'); }} />}
      </div>
    </div>
  );
}

export function CalendarPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-ink/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-4xl h-[85vh] rounded-3xl bg-background shadow-pop border border-border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h2 className="font-semibold text-ink">Calendar</h2>
          <div className="flex items-center gap-1">
            <Link href="/student/calendar" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-muted" title="Open full calendar">
              <Maximize2 className="size-4" />
            </Link>
            <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <CalendarView initialView="week" />
        </div>
      </div>
    </div>
  );
}

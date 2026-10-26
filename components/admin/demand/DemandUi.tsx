'use client';

/**
 * Building blocks for /admin/demand. Light admin theme, the same palette as
 * /admin/signups: white cards on the page background, gray-900 text, iTutor
 * green for the thing being measured. The page used to be gray-800 cards with
 * gray-400/500 text on a light shell — unreadable, and off-brand.
 */

import type { ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'green' | 'amber' | 'red';
}) {
  const valueColor =
    tone === 'green'
      ? 'text-itutor-green'
      : tone === 'amber'
        ? 'text-amber-600'
        : tone === 'red'
          ? 'text-red-600'
          : 'text-gray-900';
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-gray-600">{hint}</p> : null}
    </div>
  );
}

/**
 * A ranked row with a two-tone bar: the full bar is every request, the solid
 * part is the share still unmet. One glance says "popular" vs "popular AND
 * nobody is serving it".
 */
export function RankBar({
  rank,
  label,
  total,
  unmet,
  max,
  right,
  sub,
}: {
  rank?: number;
  label: ReactNode;
  total: number;
  unmet?: number;
  max: number;
  right?: ReactNode;
  sub?: ReactNode;
}) {
  const width = max > 0 ? Math.max(2, (total / max) * 100) : 0;
  const unmetWidth = total > 0 && unmet !== undefined ? (unmet / total) * 100 : 0;
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          {rank !== undefined ? (
            <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-400">
              {rank}
            </span>
          ) : null}
          <span className="truncate text-sm font-medium text-gray-900">{label}</span>
        </div>
        <div className="shrink-0 text-sm tabular-nums text-gray-700">{right ?? total}</div>
      </div>
      <div className={`mt-1.5 h-2 rounded-full bg-gray-100 ${rank !== undefined ? 'ml-7' : ''}`}>
        <div className="relative h-2 rounded-full bg-emerald-200" style={{ width: `${width}%` }}>
          {unmet !== undefined ? (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-itutor-green"
              style={{ width: `${unmetWidth}%` }}
            />
          ) : (
            <div className="absolute inset-0 rounded-full bg-itutor-green" />
          )}
        </div>
      </div>
      {sub ? <div className={`mt-1 text-xs text-gray-600 ${rank !== undefined ? 'ml-7' : ''}`}>{sub}</div> : null}
    </li>
  );
}

export function BarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-4 rounded-full bg-itutor-green" /> Still unmet
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-4 rounded-full bg-emerald-200" /> Served
      </span>
    </div>
  );
}

export function Pill({
  children,
  tone = 'gray',
}: {
  children: ReactNode;
  tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const tones = {
    gray: 'border-gray-200 bg-gray-50 text-gray-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-700',
    blue: 'border-sky-200 bg-sky-50 text-sky-800',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** A segmented control, used for tabs-within-tabs (sort order, filters). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function money(value: number | null): string {
  return value === null ? 'No limit' : `$${value}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TT', { year: 'numeric', month: 'short', day: 'numeric' });
}

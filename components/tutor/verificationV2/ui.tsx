'use client';

// The building blocks of the teacher verification screens. They copy the
// "Complete your profile" checklist (app/tutor/get-listed/page.tsx): the same card, the
// same header with a status pill, the same progress card and the same buttons, all from
// the site's own tokens. Nothing here introduces a colour, size or radius the checklist
// does not already use.

import type { ReactNode } from 'react';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SUPPORT_EMAIL = 'hello@myitutor.com';

export type StepState = 'complete' | 'incomplete' | 'optional';

/** Titles and one-line descriptions, shared by the open step and the collapsed ones. */
export const STEP_META = {
  1: { title: 'Consent', subtitle: 'Read what we collect and how it is used.' },
  2: { title: 'Identity check', subtitle: 'A quick check of your government ID and a selfie.' },
  3: { title: 'Qualifications', subtitle: 'Add the CSEC, CAPE or degree results you teach from, with proof.' },
  4: { title: 'Extras', subtitle: 'Optional: up to three more things students may want to know.' },
} as const;

/** The status pill from the checklist: COMPLETE / INCOMPLETE, or OPTIONAL. */
export function StatePill({ state }: { state: StepState }) {
  if (state === 'optional') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 bg-sky/20 text-sky-700">
        Optional
      </span>
    );
  }
  const done = state === 'complete';
  return (
    <span
      className={cn(
        'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0',
        done ? 'bg-brand/15 text-brand-deep' : 'bg-muted text-muted-foreground'
      )}
    >
      {done ? 'Complete' : 'Incomplete'}
    </span>
  );
}

/**
 * With a title this is the checklist's section card (header with a tick, title,
 * description and pill, then the body). Without one it is a plain card for a message.
 * `collapsed` shows only the header; with `onOpen` the header is a button.
 */
export function Card({
  children,
  className = '',
  title,
  subtitle,
  state,
  collapsed = false,
  onOpen,
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  state?: StepState;
  collapsed?: boolean;
  onOpen?: () => void;
}) {
  if (!title) {
    return <div className={cn('rounded-2xl border border-border bg-card p-5 text-ink', className)}>{children}</div>;
  }

  const done = state === 'complete';
  const head = (
    <>
      <span
        className={cn(
          'size-7 rounded-full grid place-items-center shrink-0',
          done ? 'bg-brand text-white' : 'bg-muted text-muted-foreground'
        )}
      >
        {done ? <Check className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
      </span>
      <span className="flex-1 text-left">
        <span className="block font-semibold text-ink">{title}</span>
        {subtitle && <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {state && <StatePill state={state} />}
    </>
  );

  return (
    <section className={cn('rounded-2xl border border-border bg-card', className)}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            'flex w-full min-h-[44px] items-start gap-3 px-5 py-4 text-left hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-2xl',
            !collapsed && 'border-b border-border rounded-b-none'
          )}
        >
          {head}
        </button>
      ) : (
        <header className={cn('flex items-start gap-3 px-5 py-4', !collapsed && 'border-b border-border')}>{head}</header>
      )}
      {!collapsed && <div className="p-5">{children}</div>}
    </section>
  );
}

/** "N of M complete" with the bar, as at the top of the checklist. */
export function ProgressCard({ completed, total, hint }: { completed: number; total: number; hint?: string }) {
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink">
          {completed} of {total} complete
        </span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      <div
        className="mt-2 h-2 bg-muted rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Verification progress"
      >
        <div className="h-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The checklist's amber notice. */
export function Notice({ children, className = '', role }: { children: ReactNode; className?: string; role?: 'status' | 'alert' }) {
  return (
    <div role={role} className={cn('rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800', className)}>
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  const { busy, children, className = '', disabled, ...rest } = props;
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    />
  );
}

/** Form field classes copied from the checklist's inputs. */
export const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50';

/** Shown when the automatic check cannot continue. There is no manual identity review. */
export function SupportNote({ reason }: { reason: string }) {
  return (
    <Notice>
      <p className="font-semibold">{reason}</p>
      <p className="mt-1">
        Please contact us at{' '}
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}?subject=Teacher%20identity%20check`}>
          {SUPPORT_EMAIL}
        </a>{' '}
        and we will help.
      </p>
    </Notice>
  );
}

/** Reads an API error body without throwing on non-JSON. */
export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

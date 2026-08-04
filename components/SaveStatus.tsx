'use client';

import { Check, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Autosave } from '@/lib/hooks/useAutosave';

function timeLabel(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Quiet inline autosave feedback. One line per section — deliberately not a
 * toast, because these pages have too many fields for that to stay readable.
 */
export default function SaveStatus({ state, className }: { state: Autosave; className?: string }) {
  const base = cn('inline-flex items-center gap-1.5 text-xs', className);

  if (state.invalid) {
    return (
      <span className={cn(base, 'text-muted-foreground')}>
        <AlertCircle className="size-3.5 text-amber-500" />
        {state.invalid}
      </span>
    );
  }

  if (state.status === 'error') {
    return (
      <span className={cn(base, 'text-red-600')}>
        <AlertCircle className="size-3.5" />
        {state.error || 'Couldn’t save'}
        <button
          type="button"
          onClick={() => void state.retry()}
          className="font-semibold underline hover:no-underline"
        >
          Retry
        </button>
      </span>
    );
  }

  if (state.status === 'pending' || state.status === 'saving') {
    return (
      <span className={cn(base, 'text-muted-foreground')}>
        <Loader2 className="size-3.5 animate-spin" />
        Saving…
      </span>
    );
  }

  if (state.status === 'saved') {
    return (
      <span className={cn(base, 'text-brand-deep')}>
        <Check className="size-3.5" />
        Saved{state.savedAt ? ` ${timeLabel(state.savedAt)}` : ''}
      </span>
    );
  }

  return <span className={cn(base, 'text-muted-foreground')} aria-hidden />;
}

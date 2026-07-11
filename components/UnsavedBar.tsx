'use client';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function UnsavedBar({
  dirty,
  onSave,
  onDiscard,
  saveLabel = 'Save changes',
  saving = false,
  variant = 'primary',
}: {
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  saving?: boolean;
  /** 'secondary' de-emphasizes the Save button — use when saving already happens automatically and this is just a manual fallback. */
  variant?: 'primary' | 'secondary';
}) {
  return (
    <div className={cn(
      'sticky bottom-4 z-30 mx-auto max-w-3xl mt-6 transition-all duration-200',
      dirty ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none',
    )}>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/95 backdrop-blur shadow-lg px-4 py-3 flex items-center gap-3">
        <AlertCircle className="size-4 text-amber-700 shrink-0" />
        <div className="text-sm font-semibold text-amber-900 flex-1">
          {variant === 'secondary' ? 'Saving automatically…' : 'You have unsaved changes'}
        </div>
        <button type="button" onClick={onDiscard}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-amber-900 hover:bg-amber-100">
          Discard
        </button>
        <button type="button" onClick={onSave} disabled={saving}
          className={cn(
            'px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-60',
            variant === 'secondary'
              ? 'border border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100'
              : 'bg-brand text-white hover:bg-brand/90',
          )}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

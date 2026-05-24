'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

type StarInputProps = {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
  className?: string;
};

export function StarInput({
  value,
  onChange,
  size = 44,
  readOnly,
  className,
}: StarInputProps) {
  return (
    <div
      className={cn('inline-flex items-center gap-1', className)}
      role="radiogroup"
      aria-label="Star rating"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            onKeyDown={(e) => {
              if (readOnly) return;
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                onChange?.(Math.min(5, value + 1));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                onChange?.(Math.max(1, value - 1));
              } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onChange?.(n);
              }
            }}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-checked={value === n}
            role="radio"
            className={cn(
              'grid place-items-center rounded-md transition active:scale-95',
              !readOnly && 'hover:scale-110 cursor-pointer',
              readOnly && 'cursor-default',
            )}
            style={{ width: size, height: size, minWidth: size }}
          >
            <Star
              className={cn(
                filled ? 'fill-brand text-brand' : 'fill-gray-200 text-gray-300',
              )}
              style={{ width: size * 0.65, height: size * 0.65 }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Read-only half-star row for display */
export function StarRow({
  value,
  size = 16,
}: {
  value: number;
  size?: number;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <div
            key={n}
            className="relative"
            style={{ width: size, height: size }}
          >
            <Star
              className="absolute inset-0 fill-gray-200 text-gray-300"
              style={{ width: size, height: size }}
            />
            {fill > 0 && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star
                  className="fill-brand text-brand"
                  style={{ width: size, height: size }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

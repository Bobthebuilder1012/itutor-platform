import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
  className?: string;
};

export function StarInput({ value, onChange, size = 44, readOnly, className }: Props) {
  return (
    <div className={cn('inline-flex items-center gap-1', className)} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-checked={value === n}
            role="radio"
            className={cn('grid place-items-center rounded-md transition active:scale-95', !readOnly && 'hover:scale-110')}
            style={{ width: size, height: size }}
          >
            <Star
              className={cn(filled ? 'fill-brand text-brand' : 'fill-muted text-muted-foreground/40')}
              style={{ width: size * 0.7, height: size * 0.7 }}
            />
          </button>
        );
      })}
    </div>
  );
}

export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <div key={n} className="relative" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 fill-muted text-muted-foreground/30" style={{ width: size, height: size }} />
            {fill > 0 && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="fill-brand text-brand" style={{ width: size, height: size }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

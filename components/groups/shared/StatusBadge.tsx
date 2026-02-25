'use client';

type BadgeVariant = 'active' | 'pending' | 'missed' | 'upcoming' | 'cancelled' | 'free' | 'outdated';

interface StatusBadgeProps {
  variant: BadgeVariant;
  label?: string;
  className?: string;
}

const STYLES: Record<BadgeVariant, string> = {
  active:    'bg-emerald-100 text-emerald-700 border border-emerald-200',
  pending:   'bg-amber-100 text-amber-700 border border-amber-200',
  missed:    'bg-red-100 text-red-700 border border-red-200',
  upcoming:  'bg-blue-100 text-blue-700 border border-blue-200',
  cancelled: 'bg-gray-100 text-gray-500 border border-gray-200',
  free:      'bg-emerald-50 text-emerald-600 border border-emerald-100',
  outdated:  'bg-yellow-100 text-yellow-700 border border-yellow-200',
};

const DEFAULT_LABELS: Record<BadgeVariant, string> = {
  active:    'Active',
  pending:   'Pending',
  missed:    'Missed',
  upcoming:  'Upcoming',
  cancelled: 'Cancelled',
  free:      'Free',
  outdated:  '⚠ Outdated',
};

export default function StatusBadge({ variant, label, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[variant]} ${className}`}
    >
      {label ?? DEFAULT_LABELS[variant]}
    </span>
  );
}

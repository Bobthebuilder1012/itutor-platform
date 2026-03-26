'use client';

export default function ReviewCard({
  review,
}: {
  review: {
    id: string;
    rating: number;
    comment?: string | null;
    created_at: string;
    reviewer?: { full_name?: string | null; avatar_url?: string | null } | null;
  };
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">{review.reviewer?.full_name ?? 'Student'}</p>
        <p className="text-xs text-amber-600">{'★'.repeat(Math.max(1, Math.min(5, Math.round(review.rating))))}</p>
      </div>
      <p className="mt-2 text-sm text-gray-700">{review.comment || 'No written comment.'}</p>
      <p className="mt-2 text-xs text-gray-500">{new Date(review.created_at).toLocaleDateString()}</p>
    </div>
  );
}


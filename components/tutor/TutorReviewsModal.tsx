'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';

type Review = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  student: {
    full_name: string;
    username: string;
  };
};

type Props = {
  tutorId: string;
  isOpen: boolean;
  onClose: () => void;
};

export default function TutorReviewsModal({ tutorId, isOpen, onClose }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(nextOffset: number, append: boolean) {
    const limit = 15;
    try {
      setError(null);
      const res = await fetch(
        `/api/public/tutors/${tutorId}/reviews?limit=${limit}&offset=${nextOffset}`,
        { cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load reviews');

      const nextReviews = (data?.reviews || []) as Review[];
      setHasMore(Boolean(data?.hasMore));
      setOffset(nextOffset);
      setReviews((prev) => (append ? [...prev, ...nextReviews] : nextReviews));
    } catch (e: any) {
      setError(e?.message || 'Failed to load reviews');
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    loadPage(0, false).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tutorId]);

  async function onSeeMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    await loadPage(offset + 15, true);
    setLoadingMore(false);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Student reviews" size="lg">
      {loading ? (
        <p className="text-gray-600">Loading reviews…</p>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-gray-600">No reviews yet.</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{r.student.full_name}</p>
                  {r.student.username ? (
                    <p className="text-sm text-gray-500">@{r.student.username}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="flex justify-end text-base">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span key={s} className={s <= r.stars ? 'text-yellow-400' : 'text-gray-300'}>
                        ★
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {r.comment ? (
                <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{r.comment}</p>
              ) : (
                <p className="mt-3 text-sm text-gray-400 italic">No written feedback.</p>
              )}
            </div>
          ))}

          {hasMore ? (
            <button
              type="button"
              onClick={onSeeMore}
              disabled={loadingMore}
              className={`w-full rounded-xl px-4 py-3 font-semibold text-white transition-all ${
                loadingMore ? 'bg-gray-300 cursor-not-allowed' : 'bg-itutor-green hover:bg-itutor-green/90'
              }`}
            >
              {loadingMore ? 'Loading…' : 'See more'}
            </button>
          ) : null}
        </div>
      )}
    </Modal>
  );
}


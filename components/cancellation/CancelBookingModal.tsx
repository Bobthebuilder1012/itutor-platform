'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOOKING_CANCELLATION_REASON_LABELS } from '@/lib/constants/bookingCancellationReasons';

type StudentPreview = {
  role: 'student';
  session_price_ttd: number;
  remaining_ttd: number;
  hours_before: number;
  is_late: boolean;
  late_cutoff_hours: number;
  cancel_state: { count_30d: number; is_warned: boolean; warning_issued_at: string | null; late_cancel_fee_applies: boolean };
  will_charge_fee: boolean;
  refund_ttd: number;
  retained_ttd: number;
  tutor_payout_on_retention_ttd: number;
  platform_fee_on_retention_ttd: number;
  policy: string;
};

type TutorPreview = {
  role: 'tutor';
  session_price_ttd: number;
  remaining_ttd: number;
  hours_before: number;
  is_super_late: boolean;
  super_late_cutoff_minutes: number;
  strike_state: { active_strikes: number; warning_threshold: number; suspension_threshold: number };
  refund_ttd: number;
  will_record_strike: boolean;
  will_record_system_rating: boolean;
  system_rating_stars: number | null;
  policy: string;
};

type Preview = StudentPreview | TutorPreview;

interface Props {
  open: boolean;
  bookingId: string;
  role: 'student' | 'tutor';
  onClose: () => void;
  onCancelled?: () => void;
}

export default function CancelBookingModal({ open, bookingId, role, onClose, onCancelled }: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
    setPreview(null);
    setLoadingPreview(true);
    fetch(`/api/bookings/cancel-preview?bookingId=${encodeURIComponent(bookingId)}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, body: b })))
      .then(({ ok, body }) => {
        if (!ok) {
          setError(body?.error || 'Failed to load preview');
          return;
        }
        setPreview(body as Preview);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load preview'))
      .finally(() => setLoadingPreview(false));
  }, [open, bookingId]);

  async function submit() {
    if (!reason) {
      setError('Please select a reason for cancelling.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const endpoint =
        role === 'student' ? '/api/bookings/student-cancel' : '/api/bookings/tutor-cancel';
      const body =
        role === 'student'
          ? { bookingId, reason: reason.trim() }
          : { booking_id: bookingId, reason: reason.trim() };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to cancel booking');
        return;
      }
      onCancelled?.();
      const params = new URLSearchParams({
        bookingId,
        refund: String(data?.refund?.refunded_ttd ?? 0),
        retained: String(data?.refund?.retained_ttd ?? 0),
        late: String(Boolean(data?.was_late || data?.was_super_late)),
        feeApplied: String(Boolean(data?.fee_applied)),
      });
      if (role === 'student') {
        router.push(
          (data?.fee_applied
            ? `/student/bookings/cancelled/partial?`
            : `/student/bookings/cancelled/full?`) + params.toString()
        );
      } else {
        router.push(`/tutor/bookings/cancelled?` + params.toString());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel booking');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-6 py-4 ${role === 'tutor' ? 'bg-red-600' : 'bg-amber-600'} text-white rounded-t-2xl`}>
          <h3 className="text-lg font-bold">
            {role === 'tutor' ? 'Cancel this session' : 'Cancel booking'}
          </h3>
          <p className="text-sm opacity-90 mt-1">
            {role === 'tutor'
              ? 'The student will receive a full refund.'
              : 'Review the details before confirming.'}
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {loadingPreview && <div className="text-sm text-gray-500">Loading preview…</div>}

          {preview && (
            <>
              <div className="text-sm text-gray-700 grid grid-cols-2 gap-y-1">
                <span className="text-gray-500">Session price</span>
                <span className="text-right font-medium">TTD {preview.session_price_ttd.toFixed(2)}</span>
                <span className="text-gray-500">Time until session</span>
                <span className="text-right font-medium">
                  {preview.hours_before <= 0
                    ? 'started'
                    : preview.hours_before < 1
                      ? `${Math.round(preview.hours_before * 60)} min`
                      : `${preview.hours_before.toFixed(1)} h`}
                </span>
              </div>

              <label className="block text-sm font-medium text-gray-700">Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Choose a reason…</option>
                {BOOKING_CANCELLATION_REASON_LABELS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {preview.role === 'student' && (
                <div className="rounded-xl border bg-gray-50 p-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cancellation fee</span>
                    <span className={preview.will_charge_fee ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                      {preview.will_charge_fee ? `− TTD ${preview.retained_ttd.toFixed(2)}` : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="font-semibold">Your refund</span>
                    <span className="font-bold text-lg text-green-700">
                      TTD {preview.refund_ttd.toFixed(2)}
                    </span>
                  </div>
                  {preview.cancel_state.count_30d > 0 && (
                    <div className="text-xs text-gray-500 pt-1">
                      You have {preview.cancel_state.count_30d} cancellation
                      {preview.cancel_state.count_30d === 1 ? '' : 's'} in the last 30 days
                      {preview.cancel_state.is_warned ? ' (warned state).' : '.'}
                    </div>
                  )}
                </div>
              )}

              {preview.role === 'tutor' && (
                <div className="rounded-xl border bg-gray-50 p-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Student refund</span>
                    <span className="font-semibold text-green-700">
                      TTD {preview.refund_ttd.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Your payout</span>
                    <span className="font-semibold text-red-600">TTD 0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Strike recorded</span>
                    <span className="font-medium text-amber-700">
                      {preview.strike_state.active_strikes + 1} of {preview.strike_state.suspension_threshold}
                    </span>
                  </div>
                  {preview.will_record_system_rating && (
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="text-gray-500">System rating</span>
                      <span className="font-semibold text-red-600">
                        {preview.system_rating_stars}-star (appealable)
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-gray-700">
                {preview.policy}
              </div>
            </>
          )}

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-2 justify-end rounded-b-2xl">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Keep booking
          </button>
          <button
            type="button"
            disabled={submitting || !reason || !preview}
            onClick={() => void submit()}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${
              role === 'tutor' ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {submitting ? 'Cancelling…' : 'Confirm cancellation'}
          </button>
        </div>
      </div>
    </div>
  );
}

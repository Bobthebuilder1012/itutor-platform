'use client';

import { useState } from 'react';

interface RemoveMemberModalProps {
  memberName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  /** Whether the member has an active paid subscription (shows refund warning) */
  hasActiveSubscription?: boolean;
}

export default function RemoveMemberModal({
  memberName,
  isOpen,
  onClose,
  onConfirm,
  hasActiveSubscription = true,
}: RemoveMemberModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleConfirm() {
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Removal failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-bold text-gray-900">
            Remove {memberName}?
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            The student will be removed from this class
            {hasActiveSubscription && ' and receive a full refund for the current month'}.
          </p>
        </div>

        {/* Warning box */}
        {hasActiveSubscription && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-700">
              If the tutor payout was already released, iTutor will refund the student now and
              recover the amount from future tutor earnings.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 px-6 py-5 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50 transition-colors"
          >
            {loading ? 'Removing…' : 'Confirm removal'}
          </button>
        </div>
      </div>
    </div>
  );
}

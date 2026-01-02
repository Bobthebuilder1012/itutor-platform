'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { TutorSubject, Subject } from '@/lib/types/database';

type EditSubjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tutorSubject: (TutorSubject & { subjects?: Subject }) | null;
  onSubjectUpdated: () => void;
  onSubjectDeleted: () => void;
};

export default function EditSubjectModal({
  isOpen,
  onClose,
  tutorSubject,
  onSubjectUpdated,
  onSubjectDeleted,
}: EditSubjectModalProps) {
  const [pricePerHour, setPricePerHour] = useState('100');
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Calculate commission rate based on price
  const getCommissionRate = (price: number): number => {
    if (price === 0) return 0; // Free sessions - no commission
    if (price < 100) return 10;
    if (price < 200) return 15;
    return 20;
  };

  const currentPrice = parseFloat(pricePerHour) || 0;
  const commissionRate = getCommissionRate(currentPrice);
  const commissionAmount = currentPrice * (commissionRate / 100);
  const yourEarnings = currentPrice - commissionAmount;

  useEffect(() => {
    if (tutorSubject) {
      setPricePerHour(tutorSubject.price_per_hour_ttd.toString());
    }
  }, [tutorSubject]);

  async function handleUpdateSubject() {
    if (!tutorSubject || !pricePerHour) return;

    const priceNum = parseFloat(pricePerHour);
    if (isNaN(priceNum) || priceNum < 0) {
      alert('Please enter a valid price ($0 or more)');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('tutor_subjects')
        .update({
          price_per_hour_ttd: priceNum,
        })
        .eq('id', tutorSubject.id);

      if (error) throw error;

      alert('Subject updated successfully!');
      onSubjectUpdated();
      onClose();
    } catch (error) {
      console.error('Error updating subject:', error);
      alert('Failed to update subject. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSubject() {
    if (!tutorSubject) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('tutor_subjects')
        .delete()
        .eq('id', tutorSubject.id);

      if (error) throw error;

      alert('Subject removed successfully!');
      onSubjectDeleted();
      onClose();
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Error deleting subject:', error);
      alert('Failed to remove subject. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen || !tutorSubject) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-2xl font-bold text-itutor-white mb-2">Edit Subject</h2>
        <p className="text-gray-400 mb-6">
          {tutorSubject.subjects?.curriculum} - {tutorSubject.subjects?.name}
        </p>

        {!showDeleteConfirm ? (
          <>
            <div className="space-y-5">
              {/* Price Per Hour */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Price Per Hour (TTD)
                </label>
                <p className="text-xs text-gray-500 mb-3">Set your hourly rate (can be $0 for free sessions)</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={pricePerHour}
                    onChange={(e) => setPricePerHour(e.target.value)}
                    className="w-full bg-gray-900 text-itutor-white border border-gray-700 rounded-lg pl-8 pr-4 py-3 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                    placeholder="100"
                  />
                </div>
              </div>

              {/* Dynamic Earnings Breakdown */}
              {currentPrice === 0 ? (
                <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border-2 border-blue-400/50 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-300 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-bold text-white mb-1">FREE Session</p>
                      <p className="text-xs text-gray-200">No commission charged • Perfect for building ratings!</p>
                    </div>
                  </div>
                </div>
              ) : currentPrice > 0 && (
                <div className="bg-gradient-to-r from-emerald-900/20 to-green-900/20 border border-emerald-700/50 rounded-lg p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Session Price</span>
                      <span className="text-itutor-white font-semibold">${currentPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">iTutor Commission ({commissionRate}%)</span>
                      <span className="text-red-400">-${commissionAmount.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-emerald-700/30 pt-2 flex items-center justify-between">
                      <span className="text-emerald-300 font-semibold">Your Earnings</span>
                      <span className="text-emerald-300 font-bold text-lg">${yourEarnings.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-3 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700/50 rounded-lg font-semibold transition-colors"
                disabled={loading}
              >
                Remove
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-semibold transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSubject}
                disabled={loading || !pricePerHour}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Delete Confirmation */}
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 mb-6">
              <p className="text-red-400 font-semibold mb-2">Are you sure?</p>
              <p className="text-gray-300 text-sm">
                This will remove <span className="font-bold text-itutor-white">{tutorSubject.subjects?.name}</span> from your teaching subjects. You can always add it back later.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-semibold transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSubject}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Removing...' : 'Yes, Remove'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


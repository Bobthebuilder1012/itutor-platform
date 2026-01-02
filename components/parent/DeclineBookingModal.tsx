'use client';

import { useState } from 'react';

interface DeclineBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  studentName: string;
  tutorName: string;
  childColor: string;
  submitting: boolean;
}

export default function DeclineBookingModal({
  isOpen,
  onClose,
  onConfirm,
  studentName,
  tutorName,
  childColor,
  submitting
}: DeclineBookingModalProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    onConfirm(reason);
    setReason('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div 
          className="p-6 border-b-4 rounded-t-2xl"
          style={{ borderColor: childColor }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${childColor}20` }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: childColor }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Decline Booking Request</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div 
            className="p-4 rounded-lg border-2"
            style={{ 
              backgroundColor: `${childColor}10`,
              borderColor: `${childColor}40`
            }}
          >
            <p className="text-gray-900 font-medium">
              You are declining <span className="font-bold" style={{ color: childColor }}>{studentName}</span>'s booking request with{' '}
              <span className="font-semibold">{tutorName}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Reason for declining <span className="text-gray-500">(Optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let your child know why you're declining this booking..."
              rows={4}
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:border-transparent focus:outline-none transition resize-none"
              style={{ 
                borderColor: reason ? childColor : undefined,
                focusRing: `2px solid ${childColor}`
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              Your child will see this message
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 rounded-b-2xl flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold shadow-lg hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {submitting ? 'Declining...' : 'Decline Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}





'use client';

import { useEffect } from 'react';

type Role = 'tutor' | 'student' | 'parent';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  role?: Role;
};

const SUBTITLE: Record<Role, string> = {
  student: "You'll need to sign in again to access your classes and bookings.",
  tutor:   "You'll need to sign in again to manage your classes and students.",
  parent:  "You'll need to sign in again to view your children's progress.",
};

export default function LogoutConfirmModal({ open, onClose, onConfirm, role = 'student' }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-white shadow-xl p-6 space-y-4"
      >
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-gray-900">Log out?</h3>
          <p className="text-sm text-gray-500">{SUBTITLE[role]}</p>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-full text-sm font-semibold text-gray-600 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-3 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

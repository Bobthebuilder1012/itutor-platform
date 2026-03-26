'use client';

import { useEffect, useState } from 'react';
import LoginForm from '@/components/auth/LoginForm';
import SignupForm from '@/components/auth/SignupForm';

type AuthMode = 'login' | 'signup';

interface AuthModalProps {
  isOpen: boolean;
  mode: AuthMode;
  onClose: () => void;
  redirectTo?: string;
}

export default function AuthModal({ isOpen, mode, onClose, redirectTo }: AuthModalProps) {
  const [currentMode, setCurrentMode] = useState<AuthMode>(mode);

  useEffect(() => {
    if (isOpen) {
      setCurrentMode(mode);
    }
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        aria-label="Close authentication modal"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      <div className="relative h-full w-full flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-5 sm:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <span className="text-xl leading-none">×</span>
          </button>

          <div className="mb-4 pr-8">
            <h2 className="text-2xl font-bold text-gray-900">
              {currentMode === 'login' ? 'Log In' : 'Sign Up'}
            </h2>
          </div>

          {currentMode === 'login' ? (
            <LoginForm
              redirectTo={redirectTo}
              onSuccess={onClose}
              onSwitchMode={() => setCurrentMode('signup')}
            />
          ) : (
            <SignupForm
              redirectTo={redirectTo}
              onSuccess={onClose}
              onSwitchMode={() => setCurrentMode('login')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

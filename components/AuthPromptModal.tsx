'use client';

import { useRouter } from 'next/navigation';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface AuthPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: 'book' | 'message' | 'like' | 'comment' | 'post' | 'rate' | 'save';
  redirectUrl?: string;
}

const actionMessages = {
  book: {
    title: 'Sign in to Book a Session',
    description: 'Create an account or log in to book sessions with tutors.',
  },
  message: {
    title: 'Sign in to Send Messages',
    description: 'Create an account or log in to start messaging tutors and students.',
  },
  like: {
    title: 'Sign in to Like Comments',
    description: 'Create an account or log in to like or dislike comments.',
  },
  comment: {
    title: 'Sign in to Comment',
    description: 'Create an account or log in to join the conversation.',
  },
  post: {
    title: 'Sign in to Post Questions',
    description: 'Create an account or log in to ask questions in the community.',
  },
  rate: {
    title: 'Sign in to Rate Tutors',
    description: 'Create an account or log in to leave ratings and reviews.',
  },
  save: {
    title: 'Sign in to Save Tutors',
    description: 'Create an account or log in to save your favorite tutors.',
  },
};

export default function AuthPromptModal({
  isOpen,
  onClose,
  action,
  redirectUrl,
}: AuthPromptModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const { title, description } = actionMessages[action];
  const currentUrl = redirectUrl || (typeof window !== 'undefined' ? window.location.pathname : '/');

  const handleLogin = () => {
    router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
  };

  const handleSignup = () => {
    router.push(`/signup?redirect=${encodeURIComponent(currentUrl)}`);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>

          {/* Icon */}
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-itutor-green/20 to-emerald-500/20 rounded-full">
            <svg
              className="w-8 h-8 text-itutor-green"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>

          {/* Content */}
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
            {title}
          </h2>
          <p className="text-gray-600 text-center mb-6">
            {description}
          </p>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSignup}
              className="w-full px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-500 text-white font-semibold rounded-xl hover:shadow-xl hover:scale-105 transition-all duration-300"
            >
              Create Account
            </button>
            <button
              onClick={handleLogin}
              className="w-full px-6 py-3 bg-white text-itutor-green font-semibold rounded-xl border-2 border-itutor-green hover:bg-green-50 transition-all duration-300"
            >
              Log In
            </button>
          </div>

          {/* Footer */}
          <p className="text-xs text-gray-500 text-center mt-6">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </>
  );
}


'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function EmailConfirmedPage() {
  const router = useRouter();

  // Auto-redirect after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/login');
    }, 5000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 px-4 py-8">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-green-100">
          {/* Success Icon */}
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          {/* Success Message */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
            Email Confirmed! ✅
          </h1>
          <p className="text-base sm:text-lg text-gray-600 mb-6 leading-relaxed">
            Your email has been successfully verified. Your iTutor account is now active.
          </p>

          {/* Instructions */}
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 font-medium">
              You can now log in to complete your profile setup and start using iTutor.
            </p>
          </div>

          {/* Action Button */}
          <Link
            href="/login"
            className="inline-block w-full bg-gradient-to-r from-itutor-green to-emerald-500 text-black font-bold py-3 px-6 rounded-lg hover:shadow-lg hover:shadow-itutor-green/50 hover:scale-[1.02] transition-all duration-300 mb-4"
          >
            Continue to Login
          </Link>

          {/* Auto-redirect notice */}
          <p className="text-xs text-gray-500">
            You'll be automatically redirected in 5 seconds...
          </p>
        </div>

        {/* iTutor Branding */}
        <div className="mt-6 text-center">
          <img
            src="/assets/logo/itutor-logo-light.png"
            alt="iTutor"
            className="h-8 w-auto mx-auto opacity-50"
          />
        </div>
      </div>
    </div>
  );
}


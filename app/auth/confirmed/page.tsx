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
            ✅ Email Confirmed!
          </h1>
          <p className="text-base sm:text-lg text-gray-600 mb-6 leading-relaxed">
            Your email has been successfully verified. Your iTutor account is now ready!
          </p>

          {/* Instructions */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 text-left">
                <p className="text-sm text-blue-900 font-semibold mb-2">Next Steps:</p>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Click "Go to Login Page" below</li>
                  <li>Enter your email and password</li>
                  <li>Complete your profile setup</li>
                  <li>Start using iTutor!</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <Link
            href="/login"
            className="inline-block w-full bg-gradient-to-r from-itutor-green to-emerald-500 text-black font-bold py-4 px-6 rounded-lg hover:shadow-lg hover:shadow-itutor-green/50 hover:scale-[1.02] transition-all duration-300 mb-4 text-center"
          >
            Go to Login Page →
          </Link>

          {/* Auto-redirect notice */}
          <p className="text-xs text-gray-500">
            Auto-redirecting to login in 5 seconds...
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



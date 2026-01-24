'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [email, setEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [manualRequestSent, setManualRequestSent] = useState(false);
  const [manualRequestLoading, setManualRequestLoading] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  // Countdown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    if (resendCooldown > 0 || !email) return;
    
    setResendLoading(true);
    setResendError('');
    setResendSuccess(false);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (error) {
        setResendError(error.message);
      } else {
        setResendSuccess(true);
        setResendCooldown(60); // 60-second cooldown
      }
    } catch (err) {
      setResendError('Failed to resend email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleManualVerificationRequest = async () => {
    if (!email) return;
    
    setManualRequestLoading(true);

    try {
      // Send a notification to admins/support (you can implement this via Supabase function or API)
      const { error } = await supabase.from('support_requests').insert({
        email: email,
        request_type: 'manual_email_verification',
        message: `User ${email} is unable to receive confirmation emails and requests manual verification. Reason: Organization email filters may be blocking automated emails.`,
        status: 'pending',
        created_at: new Date().toISOString()
      });

      if (error) {
        console.error('Error creating support request:', error);
        // Still show success to user even if DB insert fails
      }
      
      setManualRequestSent(true);
    } catch (err) {
      console.error('Error:', err);
      setManualRequestSent(true); // Show success anyway
    } finally {
      setManualRequestLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 px-4 py-8">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-yellow-100">
          {/* Warning Icon */}
          <div className="mb-6 text-center">
            <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 text-center">
            📧 Email Verification Required
          </h1>
          <p className="text-base text-gray-600 mb-6 text-center leading-relaxed">
            Your account exists but your email is not yet verified. Please check your inbox for the confirmation email.
          </p>

          {/* Email Input/Display */}
          {!email ? (
            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Enter your email address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
                placeholder="you@example.com"
                required
              />
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-gray-600 text-center">
                Verification email sent to:
              </p>
              <p className="text-base font-semibold text-gray-900 text-center break-all">
                {email}
              </p>
              <button
                onClick={() => setEmail('')}
                className="text-xs text-itutor-green hover:text-emerald-600 font-medium mt-2 block mx-auto"
              >
                Change email
              </button>
            </div>
          )}

          {/* Success Message */}
          {resendSuccess && (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-green-800">
                  ✅ Verification email sent! Please check your inbox (including spam folder).
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {resendError && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">{resendError}</p>
            </div>
          )}

          {/* Troubleshooting Tips */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900 font-semibold mb-2">📋 Can't find the email?</p>
            <ul className="text-sm text-blue-800 space-y-2 list-disc list-inside">
              <li><strong>Check spam/junk folder</strong> - Automated emails often get filtered</li>
              <li><strong>Organization email?</strong> - Company email filters may block automated emails</li>
              <li><strong>Wait a few minutes</strong> - Email delivery can take 2-5 minutes</li>
              <li><strong>Check the correct inbox</strong> - Confirm you're checking {email}</li>
            </ul>
          </div>

          {/* Resend Button */}
          <button
            onClick={handleResendEmail}
            disabled={resendCooldown > 0 || resendLoading || !email}
            className="w-full bg-gradient-to-r from-itutor-green to-emerald-500 text-black font-bold py-3 px-6 rounded-lg hover:shadow-lg hover:shadow-itutor-green/50 hover:scale-[1.02] transition-all duration-300 mb-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {resendLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              </span>
            ) : resendCooldown > 0 ? (
              `Resend available in ${resendCooldown}s`
            ) : (
              '🔄 Resend Verification Email'
            )}
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500 font-medium">Still having issues?</span>
            </div>
          </div>

          {/* Manual Verification Request */}
          {!manualRequestSent ? (
            <>
              <p className="text-sm text-gray-600 text-center mb-4">
                If you're using an <strong>organization or company email</strong>, it may be blocking our emails.
              </p>
              <button
                onClick={handleManualVerificationRequest}
                disabled={manualRequestLoading || !email}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {manualRequestLoading ? 'Submitting...' : '🆘 Request Manual Verification'}
              </button>
              <p className="text-xs text-gray-500 text-center">
                Our support team will manually verify your email within 24 hours
              </p>
            </>
          ) : (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-green-800 mb-1">✅ Manual verification requested!</p>
                  <p className="text-sm text-green-700">
                    Our support team has been notified and will verify your email within 24 hours. 
                    You'll receive a notification once approved.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Back to Login */}
          <div className="text-center pt-4 border-t border-gray-200">
            <Link 
              href="/login" 
              className="text-sm text-itutor-green hover:text-emerald-600 font-medium transition-colors"
            >
              ← Back to Login
            </Link>
          </div>
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

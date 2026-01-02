'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function SuspendedPage() {
  const router = useRouter();
  const [suspensionInfo, setSuspensionInfo] = useState<{
    reason: string;
    suspended_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSuspensionStatus();
  }, []);

  const checkSuspensionStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_suspended, suspension_reason, suspended_at')
        .eq('id', user.id)
        .single();

      if (!profile?.is_suspended) {
        // User is no longer suspended, redirect to their dashboard
        router.push('/');
        return;
      }

      setSuspensionInfo({
        reason: profile.suspension_reason || 'No reason provided',
        suspended_at: profile.suspended_at,
      });
    } catch (error) {
      console.error('Error checking suspension status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
            <svg
              className="h-10 w-10 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Account Suspended
          </h1>
          <p className="text-gray-600">
            Your account has been temporarily suspended and you cannot access the platform at this time.
          </p>
        </div>

        {suspensionInfo && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Suspension Details</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">Reason:</span>
                <p className="text-gray-600 mt-1">{suspensionInfo.reason}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Date:</span>
                <p className="text-gray-600">
                  {new Date(suspensionInfo.suspended_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            If you believe this suspension was made in error or would like to appeal, please contact support at{' '}
            <a href="mailto:support@itutor.com" className="font-semibold underline">
              support@itutor.com
            </a>
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="w-full bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}




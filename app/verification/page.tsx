'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';
import { getDisplayName } from '@/lib/utils/displayName';

function layoutRole(role: string | undefined): 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin' {
  if (role === 'tutor' || role === 'parent' || role === 'admin' || role === 'reviewer') return role;
  return 'student';
}

export default function VerificationHubPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) { router.push('/login'); return; }
    if (profile.role === 'student') router.push('/student/dashboard');
  }, [profile, profileLoading, router]);

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-itutor-green border-t-transparent" />
      </div>
    );
  }

  const isTutor = profile.role === 'tutor';
  const verificationHref = (anchor: string) => isTutor ? `/tutor/verification${anchor}` : `/verification/degree`;

  return (
    <DashboardLayout role={layoutRole(profile.role)} userName={getDisplayName(profile)}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Verification</h1>
        <p className="text-gray-600 text-sm mt-1 mb-8">
          Choose what you want to submit for review. Each type is reviewed separately.
        </p>

        <ul className="space-y-4">
          <li>
            <Link
              href="/verification/degree"
              className="block rounded-xl border-2 border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-itutor-green hover:bg-gray-50/80"
            >
              <h2 className="text-lg font-semibold text-gray-900">Degree credentials</h2>
              <p className="text-sm text-gray-600 mt-1">
                Upload your diploma or transcript for a Degree Verified badge on your profile after admin approval.
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-itutor-green">Open →</span>
            </Link>
          </li>
          <li>
            <Link
              href={verificationHref('#csec')}
              className="block rounded-xl border-2 border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-itutor-green hover:bg-gray-50/80"
            >
              <h2 className="text-lg font-semibold text-gray-900">CSEC verification</h2>
              <p className="text-sm text-gray-600 mt-1">
                Upload your CSEC certificate or official results for subject verification.
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-itutor-green">Open →</span>
            </Link>
          </li>
          <li>
            <Link
              href={verificationHref('#cape')}
              className="block rounded-xl border-2 border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-itutor-green hover:bg-gray-50/80"
            >
              <h2 className="text-lg font-semibold text-gray-900">CAPE verification</h2>
              <p className="text-sm text-gray-600 mt-1">
                Upload your CAPE certificate or official results for subject verification.
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-itutor-green">Open →</span>
            </Link>
          </li>
          <li>
            <Link
              href={verificationHref('')}
              className="block rounded-xl border-2 border-gray-100 bg-gray-50/80 p-4 shadow-sm transition-colors hover:border-itutor-green hover:bg-white"
            >
              <h2 className="text-base font-semibold text-gray-800">Other teaching certificates</h2>
              <p className="text-sm text-gray-600 mt-1">
                Other qualifications (e.g. degree slip for teaching) use the same upload flow.
              </p>
              <span className="mt-2 inline-block text-sm font-medium text-itutor-green">Open →</span>
            </Link>
          </li>
        </ul>
      </div>
    </DashboardLayout>
  );
}

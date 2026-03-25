'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import DegreeVerifiedBadge from '@/components/DegreeVerifiedBadge';
import { useProfile } from '@/lib/hooks/useProfile';
import { getDisplayName } from '@/lib/utils/displayName';

type DegreeRow = {
  id: string;
  full_name: string;
  school_name: string;
  degree: string;
  field: string | null;
  graduation_year: number;
  status: 'pending' | 'verified' | 'rejected';
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  degree_documents?: { id: string; file_url: string; uploaded_at: string }[];
  documentSignedUrl?: string | null;
};

function homeForRole(role: string | undefined) {
  if (role === 'tutor') return '/tutor/dashboard';
  if (role === 'parent') return '/parent/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/student/dashboard';
}

function layoutRole(role: string | undefined): 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin' {
  if (role === 'tutor' || role === 'parent' || role === 'admin' || role === 'reviewer') return role;
  return 'student';
}

export default function DegreeVerificationPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [degree, setDegree] = useState<DegreeRow | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [degreeTitle, setDegreeTitle] = useState('');
  const [field, setField] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/degrees/me', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error || 'Failed to load');
        setDegree(null);
        return;
      }
      setDegree(json.degree ?? null);
    } catch {
      setLoadError('Failed to load');
      setDegree(null);
    }
  }, []);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) {
      router.push('/login');
      return;
    }
    refresh();
  }, [profile, profileLoading, router, refresh]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!file) {
      setSubmitError('Please choose a PDF or image file.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('full_name', fullName.trim());
      fd.set('school_name', schoolName.trim());
      fd.set('degree', degreeTitle.trim());
      fd.set('field', field.trim());
      fd.set('graduation_year', graduationYear.trim());
      fd.set('file', file);

      const res = await fetch('/api/degrees', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(json.error || 'Submission failed');
        setSubmitting(false);
        return;
      }
      setFile(null);
      await refresh();
    } catch {
      setSubmitError('Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (profileLoading || degree === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!profile) return null;

  const showForm =
    !degree || degree.status === 'rejected';

  return (
    <DashboardLayout role={layoutRole(profile.role)} userName={getDisplayName(profile)}>
      <div className="max-w-lg mx-auto px-4 py-8">
        <Link href={homeForRole(profile.role)} className="text-sm text-indigo-600 hover:text-indigo-800 mb-6 inline-block">
          ← Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold text-gray-900">Degree verification</h1>
        <p className="text-gray-600 text-sm mt-1 mb-6">
          Submit your degree for manual review. You’ll get a verified badge when approved.
        </p>

        {loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{loadError}</div>
        )}

        {degree?.status === 'verified' && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-5 mb-6">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <DegreeVerifiedBadge />
            </div>
            <p className="text-sm text-gray-700">
              {degree.degree}
              {degree.field ? ` · ${degree.field}` : ''} — {degree.school_name} ({degree.graduation_year})
            </p>
          </div>
        )}

        {degree?.status === 'pending' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 mb-6">
            <p className="font-medium text-amber-900">Verification in progress</p>
            <p className="text-sm text-amber-800 mt-1">
              We’ll notify you when an admin has reviewed your submission. You can still view your details below.
            </p>
            <dl className="mt-3 text-sm text-gray-800 space-y-1">
              <dt className="text-gray-500">Name on degree</dt>
              <dd>{degree.full_name}</dd>
              <dt className="text-gray-500">School</dt>
              <dd>{degree.school_name}</dd>
              <dt className="text-gray-500">Degree</dt>
              <dd>{degree.degree}</dd>
              {degree.field && (
                <>
                  <dt className="text-gray-500">Field</dt>
                  <dd>{degree.field}</dd>
                </>
              )}
              <dt className="text-gray-500">Graduation year</dt>
              <dd>{degree.graduation_year}</dd>
            </dl>
            {degree.documentSignedUrl && (
              <a
                href={degree.documentSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-sm font-medium text-indigo-600 hover:underline"
              >
                View uploaded document
              </a>
            )}
          </div>
        )}

        {degree?.status === 'rejected' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 mb-6">
            <p className="font-medium text-red-900">Submission not approved</p>
            {degree.rejection_reason && (
              <p className="text-sm text-red-800 mt-2 whitespace-pre-wrap">{degree.rejection_reason}</p>
            )}
            <p className="text-sm text-red-800 mt-2">Submit the form again with a corrected document or details.</p>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            {submitError && (
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{submitError}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name (as on degree)</label>
              <input
                required
                minLength={2}
                maxLength={200}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School name</label>
              <input
                required
                minLength={2}
                maxLength={200}
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Degree</label>
              <input
                required
                minLength={2}
                maxLength={200}
                placeholder="e.g. BSc, MSc"
                value={degreeTitle}
                onChange={(e) => setDegreeTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Field of study (optional)</label>
              <input
                maxLength={300}
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Graduation year</label>
              <input
                required
                type="number"
                min={1950}
                max={new Date().getFullYear() + 10}
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document (PDF or image, max 10MB)</label>
              <input
                required
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] rounded-lg bg-indigo-600 text-white font-semibold text-sm py-3 hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}

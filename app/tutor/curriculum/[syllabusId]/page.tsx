'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';
import { getSyllabusById } from '@/lib/services/curriculumService';
import type { SyllabusWithSubject } from '@/lib/types/curriculum';
import Link from 'next/link';

export default function SyllabusViewerPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const syllabusId = params.syllabusId as string;

  const [syllabus, setSyllabus] = useState<SyllabusWithSubject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;

    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    loadSyllabus();
  }, [profile, profileLoading, router, syllabusId]);

  async function loadSyllabus() {
    setLoading(true);
    setError(null);

    try {
      const data = await getSyllabusById(syllabusId);
      
      if (!data) {
        setError('Syllabus not found or you do not have access to it.');
      } else {
        setSyllabus(data);
      }
    } catch (err) {
      console.error('Error loading syllabus:', err);
      setError('Failed to load syllabus. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (syllabus) {
      window.open(syllabus.pdf_url, '_blank', 'noopener,noreferrer');
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const displayName = profile.full_name || profile.email?.split('@')[0] || 'Tutor';

  return (
    <DashboardLayout role="tutor" userName={displayName}>
      <div className="px-4 py-6 sm:px-0 max-w-7xl mx-auto">
        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
            <span className="ml-3 text-gray-600">Loading syllabus...</span>
          </div>
        ) : error ? (
          // Error State
          <div className="text-center py-16 bg-red-50 border-2 border-red-200 rounded-2xl">
            <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Syllabus</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link
              href="/tutor/curriculum"
              className="inline-block bg-itutor-green hover:bg-emerald-600 text-white py-2 px-6 rounded-lg font-semibold transition"
            >
              Back to Curriculum
            </Link>
          </div>
        ) : syllabus ? (
          // Syllabus Viewer
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-itutor-green to-emerald-600 text-white rounded-2xl p-6 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Link
                      href="/tutor/curriculum"
                      className="text-white/80 hover:text-white transition flex items-center gap-1"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back
                    </Link>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                    {syllabus.subject_name}
                  </h1>
                  <p className="text-white/90 text-lg">
                    {syllabus.title}
                    {syllabus.version && ` - ${syllabus.version}`}
                  </p>
                  {syllabus.effective_year && (
                    <p className="text-white/80 text-sm mt-1">
                      Effective {syllabus.effective_year}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleDownload}
                  className="bg-white text-itutor-green py-3 px-6 rounded-lg font-semibold hover:bg-gray-100 transition-all duration-300 shadow-md hover:shadow-lg flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF
                </button>
              </div>
            </div>

            {/* PDF Access Card */}
            <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl shadow-xl border-2 border-gray-200 p-12 text-center">
              <div className="max-w-2xl mx-auto">
                {/* Icon */}
                <div className="mb-6">
                  <svg className="w-24 h-24 text-itutor-green mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>

                {/* Message */}
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  Official CXC Syllabus Document
                </h3>
                <p className="text-gray-700 mb-6">
                  Click the button below to open the official syllabus PDF in a new tab. 
                  You can view, download, or print it from there.
                </p>

                {/* Open PDF Button */}
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-4 px-8 rounded-xl font-bold text-lg shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open PDF in New Tab
                </button>

                {/* Info Note */}
                <div className="mt-8 pt-6 border-t border-gray-300">
                  <p className="text-sm text-gray-600 flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    CXC syllabuses open in a new tab for the best viewing experience
                  </p>
                </div>
              </div>
            </div>

            {/* Attribution Footer */}
            <div className="pt-4 border-t border-gray-300">
              <p className="text-sm text-gray-600 text-center">
                Syllabuses are the intellectual property of the Caribbean Examinations Council (CXC). 
                Links provided for reference.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}


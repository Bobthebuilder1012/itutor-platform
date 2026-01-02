'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';
import { getTutorCurriculumGrouped, getAllCurriculumGrouped } from '@/lib/services/curriculumService';
import SyllabusCard from '@/components/curriculum/SyllabusCard';
import type { TutorCurriculumData } from '@/lib/types/curriculum';
import Link from 'next/link';

export default function TutorCurriculumPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [yourCurriculumData, setYourCurriculumData] = useState<TutorCurriculumData[]>([]);
  const [allCurriculumData, setAllCurriculumData] = useState<TutorCurriculumData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (profileLoading) return;

    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    loadCurriculum();
  }, [profile, profileLoading, router]);

  async function loadCurriculum() {
    if (!profile) return;

    setLoading(true);
    try {
      const [yourData, allData] = await Promise.all([
        getTutorCurriculumGrouped(profile.id),
        getAllCurriculumGrouped()
      ]);
      setYourCurriculumData(yourData);
      setAllCurriculumData(allData);
    } catch (error) {
      console.error('Error loading curriculum:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filter all curriculum by search query
  const filteredAllCurriculum = useMemo(() => {
    if (!searchQuery.trim()) return allCurriculumData;

    const query = searchQuery.toLowerCase();
    
    return allCurriculumData.map(qualData => ({
      ...qualData,
      categories: qualData.categories.map(catData => ({
        ...catData,
        syllabuses: catData.syllabuses.filter(syl =>
          syl.title.toLowerCase().includes(query) ||
          syl.subject_name.toLowerCase().includes(query) ||
          syl.category.toLowerCase().includes(query) ||
          syl.qualification.toLowerCase().includes(query)
        )
      })).filter(catData => catData.syllabuses.length > 0)
    })).filter(qualData => qualData.categories.length > 0);
  }, [allCurriculumData, searchQuery]);

  function handleViewSyllabus(syllabusId: string) {
    router.push(`/tutor/curriculum/${syllabusId}`);
  }

  function handleDownloadSyllabus(pdfUrl: string) {
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Curriculum Resources</h1>
          <p className="text-gray-600">
            Access official CXC syllabuses for your subjects and browse all available syllabuses
          </p>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
            <span className="ml-3 text-gray-600">Loading curriculum...</span>
          </div>
        ) : (
          <div className="space-y-12">
            {/* YOUR SUBJECTS SECTION */}
            {yourCurriculumData.length > 0 && (
              <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border-2 border-emerald-200 rounded-2xl p-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Your Subjects
                  </h2>
                  <p className="text-gray-700">Syllabuses for subjects you teach</p>
                </div>

                <div className="space-y-8">
                  {yourCurriculumData.map((qualData) => (
                    <div key={qualData.qualification}>
                      <div className="mb-4">
                        <h3 className="text-xl font-bold text-gray-900">{qualData.qualification}</h3>
                      </div>

                      <div className="space-y-6">
                        {qualData.categories.map((categoryData) => (
                          <div key={categoryData.category}>
                            <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                              <span className="w-2 h-2 bg-emerald-600 rounded-full"></span>
                              {categoryData.category}
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {categoryData.syllabuses.map((syllabus) => (
                                <SyllabusCard
                                  key={syllabus.id}
                                  syllabus={syllabus}
                                  onView={handleViewSyllabus}
                                  onDownload={handleDownloadSyllabus}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ALL SYLLABUSES SECTION */}
            <div>
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">All CXC Syllabuses</h2>
                  <p className="text-gray-600">Browse and search all available syllabuses for reference</p>
                </div>
              </div>

              {/* Search Bar */}
              <div className="mb-6">
                <div className="relative">
                  <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search syllabuses by subject, category, or qualification..."
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* All Syllabuses Grid */}
              {filteredAllCurriculum.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-gray-200">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-gray-600">No syllabuses found matching "{searchQuery}"</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-3 text-itutor-green hover:text-emerald-700 font-medium"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="space-y-10">
                  {filteredAllCurriculum.map((qualData) => (
                    <div key={qualData.qualification}>
                      <div className="mb-6">
                        <h3 className="text-2xl font-bold text-gray-900 mb-1">
                          {qualData.qualification} Syllabuses
                        </h3>
                        <div className="h-1 w-24 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
                      </div>

                      <div className="space-y-8">
                        {qualData.categories.map((categoryData) => (
                          <div key={categoryData.category}>
                            <h4 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                              {categoryData.category}
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {categoryData.syllabuses.map((syllabus) => (
                                <SyllabusCard
                                  key={syllabus.id}
                                  syllabus={syllabus}
                                  onView={handleViewSyllabus}
                                  onDownload={handleDownloadSyllabus}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Attribution Footer */}
        <div className="mt-12 pt-6 border-t border-gray-300">
          <p className="text-sm text-gray-600 text-center">
            Syllabuses are the intellectual property of the Caribbean Examinations Council (CXC). 
            Links provided for reference.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}


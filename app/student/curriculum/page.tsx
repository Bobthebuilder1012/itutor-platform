'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';
import { getAllCurriculumGrouped } from '@/lib/services/curriculumService';
import SyllabusCard from '@/components/curriculum/SyllabusCard';
import type { SyllabusWithSubject, TutorCurriculumData } from '@/lib/types/curriculum';
import { getDisplayName } from '@/lib/utils/displayName';
import { isSharedCurriculumRole } from '@/lib/utils/sharedCurriculumRoles';

function favouritesStorageKey(userId: string) {
  return `itutor-curriculum-favourites:${userId}`;
}

function StarToggle({
  syllabusId,
  isFav,
  onToggle,
}: {
  syllabusId: string;
  isFav: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(syllabusId)}
      className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-sm transition hover:bg-amber-50"
      aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-4 w-4 ${isFav ? 'fill-amber-400 text-amber-400' : 'fill-none stroke-gray-500'}`}
        strokeWidth={isFav ? 0 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
      </svg>
    </button>
  );
}

function SyllabusWithStar({
  syllabus,
  isFav,
  onToggleFavourite,
  onView,
  onDownload,
}: {
  syllabus: SyllabusWithSubject;
  isFav: boolean;
  onToggleFavourite: (id: string) => void;
  onView: (id: string) => void;
  onDownload: (url: string) => void;
}) {
  return (
    <div className="relative">
      <StarToggle syllabusId={syllabus.id} isFav={isFav} onToggle={onToggleFavourite} />
      <SyllabusCard syllabus={syllabus} onView={onView} onDownload={onDownload} />
    </div>
  );
}

export default function StudentCurriculumPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [allCurriculumData, setAllCurriculumData] = useState<TutorCurriculumData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);

  useEffect(() => {
    if (profileLoading) return;

    if (!profile || !isSharedCurriculumRole(profile.role)) {
      router.push('/login');
      return;
    }

    loadCurriculum();
  }, [profile, profileLoading, router]);

  useEffect(() => {
    if (!profile?.id) return;
    try {
      const raw = localStorage.getItem(favouritesStorageKey(profile.id));
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setFavouriteIds(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      setFavouriteIds([]);
    }
  }, [profile?.id]);

  const favouriteSet = useMemo(() => new Set(favouriteIds), [favouriteIds]);

  const syllabusById = useMemo(() => {
    const map = new Map<string, SyllabusWithSubject>();
    for (const qualData of allCurriculumData) {
      for (const cat of qualData.categories) {
        for (const s of cat.syllabuses) {
          map.set(s.id, s);
        }
      }
    }
    return map;
  }, [allCurriculumData]);

  const favouriteSyllabusesOrdered = useMemo(
    () => favouriteIds.map((id) => syllabusById.get(id)).filter((s): s is SyllabusWithSubject => Boolean(s)),
    [favouriteIds, syllabusById]
  );

  const toggleFavourite = useCallback(
    (syllabusId: string) => {
      if (!profile?.id) return;
      setFavouriteIds((prev) => {
        const next = prev.includes(syllabusId)
          ? prev.filter((id) => id !== syllabusId)
          : [syllabusId, ...prev.filter((id) => id !== syllabusId)];
        try {
          localStorage.setItem(favouritesStorageKey(profile.id), JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
        return next;
      });
    },
    [profile?.id]
  );

  async function loadCurriculum() {
    if (!profile) return;

    setLoading(true);
    try {
      const allData = await getAllCurriculumGrouped();
      setAllCurriculumData(allData);
    } catch (error) {
      console.error('Error loading curriculum:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredAllCurriculum = useMemo(() => {
    if (!searchQuery.trim()) return allCurriculumData;

    const query = searchQuery.toLowerCase();

    return allCurriculumData
      .map((qualData) => ({
        ...qualData,
        categories: qualData.categories
          .map((catData) => ({
            ...catData,
            syllabuses: catData.syllabuses.filter(
              (syl) =>
                syl.title.toLowerCase().includes(query) ||
                syl.subject_name.toLowerCase().includes(query) ||
                syl.category.toLowerCase().includes(query) ||
                syl.qualification.toLowerCase().includes(query)
            ),
          }))
          .filter((catData) => catData.syllabuses.length > 0),
      }))
      .filter((qualData) => qualData.categories.length > 0);
  }, [allCurriculumData, searchQuery]);

  function handleViewSyllabus(syllabusId: string) {
    router.push(`/student/curriculum/${syllabusId}`);
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

  if (!isSharedCurriculumRole(profile.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const displayName = getDisplayName(profile);

  return (
    <DashboardLayout
      role={profile.role as 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin'}
      userName={displayName}
    >
      <div className="px-4 py-6 sm:px-0 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Curriculum Resources</h1>
          <p className="text-gray-600">
            Access official CXC syllabuses for your subjects and browse all available syllabuses
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
            <span className="ml-3 text-gray-600">Loading curriculum...</span>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <svg className="w-6 h-6 text-amber-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                  </svg>
                  favourited subjects
                </h2>
                <p className="text-gray-700">
                  Use the star on any syllabus in <strong>All CXC Syllabuses</strong> below. Only starred syllabuses
                  appear here — nothing is added until you choose.
                </p>
              </div>

              {favouriteSyllabusesOrdered.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white/60 py-14 text-center">
                  <p className="text-gray-600 font-medium">No favourites yet</p>
                  <p className="mt-1 text-sm text-gray-500">Star a subject below to pin it to this section.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {favouriteSyllabusesOrdered.map((syllabus) => (
                    <SyllabusWithStar
                      key={syllabus.id}
                      syllabus={syllabus}
                      isFav
                      onToggleFavourite={toggleFavourite}
                      onView={handleViewSyllabus}
                      onDownload={handleDownloadSyllabus}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">All CXC Syllabuses</h2>
                <p className="text-gray-600">Browse and search all available syllabuses</p>
              </div>

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
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {allCurriculumData.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-gray-200">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  <p className="text-gray-600 mb-2">No syllabuses available</p>
                  <p className="text-gray-500 text-sm">Syllabuses will appear here once they are added to the system</p>
                </div>
              ) : filteredAllCurriculum.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-gray-200">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-gray-600">No syllabuses found matching &quot;{searchQuery}&quot;</p>
                  <button
                    type="button"
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
                        <h3 className="text-2xl font-bold text-gray-900 mb-1">{qualData.qualification} Syllabuses</h3>
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
                                <SyllabusWithStar
                                  key={syllabus.id}
                                  syllabus={syllabus}
                                  isFav={favouriteSet.has(syllabus.id)}
                                  onToggleFavourite={toggleFavourite}
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

        <div className="mt-12 pt-6 border-t border-gray-300">
          <p className="text-sm text-gray-600 text-center">
            Syllabuses are the intellectual property of the Caribbean Examinations Council (CXC). Links provided for
            reference.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

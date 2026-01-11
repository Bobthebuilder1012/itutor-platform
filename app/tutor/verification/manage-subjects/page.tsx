'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';

type VerifiedSubject = {
  id: string;
  exam_type: string;
  grade: number;
  year: number | null;
  session: string | null;
  is_public: boolean;
  verified_at: string;
  subjects: {
    name: string;
    curriculum: string;
    level: string;
  };
};

export default function ManageVerifiedSubjectsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [subjects, setSubjects] = useState<VerifiedSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }
    fetchSubjects();
  }, [profile, profileLoading, router]);

  async function fetchSubjects() {
    try {
      const res = await fetch('/api/tutor/verified-subjects');
      const data = await res.json();
      setSubjects(data.subjects || []);
    } catch (err) {
      console.error('Error fetching subjects:', err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleVisibility(subjectId: string, currentlyPublic: boolean) {
    setUpdating(subjectId);
    try {
      const res = await fetch(`/api/tutor/verified-subjects/${subjectId}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !currentlyPublic })
      });

      if (!res.ok) {
        throw new Error('Failed to update visibility');
      }

      // Update local state
      setSubjects(subjects.map(s => 
        s.id === subjectId ? { ...s, is_public: !currentlyPublic } : s
      ));
    } catch (err) {
      console.error('Error toggling visibility:', err);
      alert('Failed to update visibility. Please try again.');
    } finally {
      setUpdating(null);
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
  const publicSubjects = subjects.filter(s => s.is_public);
  const hiddenSubjects = subjects.filter(s => !s.is_public);

  return (
    <DashboardLayout role="tutor" userName={displayName}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Manage Verified Subjects</h1>
        <p className="text-gray-600 mb-8">
          Control which of your verified CXC results are visible to students and parents
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
            <span className="ml-3 text-gray-600">Loading verified subjects...</span>
          </div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-16 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl">
            <svg className="w-20 h-20 text-blue-400 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">No Verified Subjects Yet</h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Upload your CXC results slip to get verified subjects added to your profile.
            </p>
            <button
              onClick={() => router.push('/tutor/verification/upload')}
              className="inline-block bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-3 px-8 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-itutor-green/50"
            >
              Upload Verification
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm text-blue-900 font-medium mb-1">About Visibility</p>
                  <p className="text-sm text-blue-800">
                    Hidden subjects are removed from public view but remain verified in your account. 
                    Only subjects marked as "Public" will be visible to students and parents viewing your profile.
                  </p>
                </div>
              </div>
            </div>

            {/* Public Subjects */}
            {publicSubjects.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Public Subjects ({publicSubjects.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {publicSubjects.map((subject) => (
                    <SubjectCard
                      key={subject.id}
                      subject={subject}
                      updating={updating === subject.id}
                      onToggle={toggleVisibility}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Hidden Subjects */}
            {hiddenSubjects.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                  Hidden Subjects ({hiddenSubjects.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {hiddenSubjects.map((subject) => (
                    <SubjectCard
                      key={subject.id}
                      subject={subject}
                      updating={updating === subject.id}
                      onToggle={toggleVisibility}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SubjectCard({ 
  subject, 
  updating, 
  onToggle 
}: { 
  subject: VerifiedSubject; 
  updating: boolean;
  onToggle: (id: string, isPublic: boolean) => void;
}) {
  return (
    <div className={`border-2 rounded-lg p-4 transition-all ${
      subject.is_public 
        ? 'bg-green-50 border-green-200' 
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">{subject.subjects.name}</h3>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded ${
              subject.exam_type === 'CSEC'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-purple-100 text-purple-800'
            }`}>
              {subject.exam_type}
            </span>
            <span className="text-sm font-semibold text-gray-700">
              Grade {subject.grade}
            </span>
            {subject.year && (
              <span className="text-xs text-gray-500">
                {subject.year}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600">
            Verified: {new Date(subject.verified_at).toLocaleDateString()}
          </p>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={subject.is_public}
            onChange={() => onToggle(subject.id, subject.is_public)}
            disabled={updating}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
          <span className="ml-2 text-xs font-medium text-gray-700">
            {subject.is_public ? 'Public' : 'Hidden'}
          </span>
        </label>
      </div>
    </div>
  );
}












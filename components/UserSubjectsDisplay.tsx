'use client';

import { useEffect, useState } from 'react';
import { getUserSubjects, UserSubjectWithDetails } from '@/lib/supabase/userSubjects';

type UserSubjectsDisplayProps = {
  userId: string;
  title?: string;
  showLevel?: boolean;
  className?: string;
};

export default function UserSubjectsDisplay({
  userId,
  title = 'Subjects',
  showLevel = true,
  className = '',
}: UserSubjectsDisplayProps) {
  const [subjects, setSubjects] = useState<UserSubjectWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSubjects() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await getUserSubjects(userId);

      if (fetchError) {
        setError('Failed to load subjects');
        setLoading(false);
        return;
      }

      setSubjects(data || []);
      setLoading(false);
    }

    if (userId) {
      loadSubjects();
    }
  }, [userId]);

  if (loading) {
    return (
      <div className={`${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className={`${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
        <p className="text-gray-500 text-sm">No subjects added yet.</p>
      </div>
    );
  }

  // Group subjects by level (CSEC and CAPE)
  const csecSubjects = subjects.filter((item) => item.subject.level === 'CSEC');
  const capeSubjects = subjects.filter((item) => item.subject.level === 'CAPE');

  return (
    <div className={`${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        {title}
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({subjects.length})
        </span>
      </h3>

      <div className="space-y-4">
        {/* CSEC Subjects */}
        {csecSubjects.length > 0 && (
          <div>
            {showLevel && (
              <h4 className="text-sm font-medium text-gray-700 mb-2">CSEC</h4>
            )}
            <div className="flex flex-wrap gap-2">
              {csecSubjects.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200"
                >
                  {item.subject.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CAPE Subjects */}
        {capeSubjects.length > 0 && (
          <div>
            {showLevel && (
              <h4 className="text-sm font-medium text-gray-700 mb-2">CAPE</h4>
            )}
            <div className="flex flex-wrap gap-2">
              {capeSubjects.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800 border border-purple-200"
                >
                  {item.subject.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}








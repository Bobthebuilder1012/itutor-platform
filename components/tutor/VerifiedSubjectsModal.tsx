'use client';

import { useState, useEffect } from 'react';

type VerifiedSubject = {
  id: string;
  exam_type: string;
  grade: number;
  year: number | null;
  session: string | null;
  verified_at: string;
  subjects: {
    id: string;
    name: string;
    curriculum: string;
    level: string;
  };
};

type VerifiedSubjectsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tutorId: string;
  tutorName: string;
};

export default function VerifiedSubjectsModal({
  isOpen,
  onClose,
  tutorId,
  tutorName
}: VerifiedSubjectsModalProps) {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<VerifiedSubject[]>([]);
  const [csecSubjects, setCsecSubjects] = useState<VerifiedSubject[]>([]);
  const [capeSubjects, setCapeSubjects] = useState<VerifiedSubject[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchVerifiedSubjects();
    }
  }, [isOpen, tutorId]);

  async function fetchVerifiedSubjects() {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/tutors/${tutorId}/verified-subjects`);
      const data = await res.json();
      
      if (data.is_verified) {
        setSubjects(data.subjects || []);
        setCsecSubjects(data.grouped?.CSEC || []);
        setCapeSubjects(data.grouped?.CAPE || []);
      }
    } catch (err) {
      console.error('Error fetching verified subjects:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Verified CXC Results</h2>
              <p className="text-sm text-green-100">{tutorName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <span className="ml-3 text-gray-600">Loading verified subjects...</span>
            </div>
          ) : subjects.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-600">No public verified subjects to display</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* CSEC Subjects */}
              {csecSubjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-xl font-bold text-gray-900">CSEC</h3>
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                      {csecSubjects.length} {csecSubjects.length === 1 ? 'subject' : 'subjects'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {csecSubjects.map((subject) => (
                      <SubjectCard key={subject.id} subject={subject} />
                    ))}
                  </div>
                </div>
              )}

              {/* CAPE Subjects */}
              {capeSubjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-xl font-bold text-gray-900">CAPE</h3>
                    <span className="bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-1 rounded">
                      {capeSubjects.length} {capeSubjects.length === 1 ? 'subject' : 'subjects'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {capeSubjects.map((subject) => (
                      <SubjectCard key={subject.id} subject={subject} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-600 text-center">
            Results verified by iTutor. CXC is a trademark of the Caribbean Examinations Council.
          </p>
        </div>
      </div>
    </div>
  );
}

function SubjectCard({ subject }: { subject: VerifiedSubject }) {
  return (
    <div className="border-2 border-gray-200 rounded-lg p-4 hover:border-green-300 hover:bg-green-50/50 transition-all">
      <h4 className="font-semibold text-gray-900 mb-2">{subject.subjects.name}</h4>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-sm font-bold text-green-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          Grade {subject.grade}
        </span>
        {subject.year && (
          <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
            {subject.year}
          </span>
        )}
        {subject.session && (
          <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
            {subject.session}
          </span>
        )}
      </div>
    </div>
  );
}




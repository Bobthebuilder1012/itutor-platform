// =====================================================
// SYLLABUS CARD COMPONENT
// =====================================================
// Reusable card for displaying a syllabus with view/download actions

import type { SyllabusWithSubject } from '@/lib/types/curriculum';

interface SyllabusCardProps {
  syllabus: SyllabusWithSubject;
  onView: (syllabusId: string) => void;
  onDownload: (pdfUrl: string) => void;
}

export default function SyllabusCard({ syllabus, onView, onDownload }: SyllabusCardProps) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-green-50 border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:border-itutor-green transition-all duration-300 hover:scale-[1.02]">
      {/* Subject Name */}
      <h3 className="text-lg font-bold text-gray-900 mb-2">
        {syllabus.subject_name}
      </h3>

      {/* Syllabus Title */}
      <p className="text-gray-700 font-medium mb-1">
        {syllabus.title}
      </p>

      {/* Version/Year */}
      {(syllabus.version || syllabus.effective_year) && (
        <p className="text-sm text-gray-600 mb-4">
          {syllabus.version && <span>{syllabus.version}</span>}
          {syllabus.version && syllabus.effective_year && <span> • </span>}
          {syllabus.effective_year && <span>Effective {syllabus.effective_year}</span>}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => onView(syllabus.id)}
          className="flex-1 bg-gradient-to-r from-itutor-green to-emerald-600 text-white py-2 px-4 rounded-lg font-semibold hover:from-emerald-600 hover:to-itutor-green transition-all duration-300 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          View
        </button>

        <button
          onClick={() => onDownload(syllabus.pdf_url)}
          className="flex-1 bg-white border-2 border-itutor-green text-itutor-green py-2 px-4 rounded-lg font-semibold hover:bg-itutor-green hover:text-white transition-all duration-300 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      </div>
    </div>
  );
}








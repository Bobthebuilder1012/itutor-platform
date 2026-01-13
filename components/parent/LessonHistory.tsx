'use client';

import { useState } from 'react';

type Lesson = {
  id: string;
  date: string;
  subject: string;
  tutor: string;
  duration: string;
  status: 'Completed' | 'Cancelled' | 'Missed';
};

type LessonHistoryProps = {
  lessons: Lesson[];
};

export default function LessonHistory({ lessons }: LessonHistoryProps) {
  const [selectedSubject, setSelectedSubject] = useState<string>('All');

  const subjects = ['All', ...Array.from(new Set(lessons.map(l => l.subject)))];
  
  const filteredLessons = selectedSubject === 'All'
    ? lessons
    : lessons.filter(l => l.subject === selectedSubject);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-900/30 text-green-400 border-green-700/50';
      case 'Cancelled':
        return 'bg-orange-900/30 text-orange-400 border-orange-700/50';
      case 'Missed':
        return 'bg-red-900/30 text-red-400 border-red-700/50';
      default:
        return 'bg-gray-900/30 text-gray-400 border-gray-700/50';
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-6 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-itutor-white">Lesson History</h2>
        
        {/* Subject Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Filter by:</label>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="bg-gray-800 text-itutor-white border border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
          >
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredLessons.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-sm font-semibold text-gray-400 pb-3 pr-4">Date</th>
                <th className="text-left text-sm font-semibold text-gray-400 pb-3 pr-4">Subject</th>
                <th className="text-left text-sm font-semibold text-gray-400 pb-3 pr-4">Tutor</th>
                <th className="text-left text-sm font-semibold text-gray-400 pb-3 pr-4">Duration</th>
                <th className="text-left text-sm font-semibold text-gray-400 pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLessons.map((lesson) => (
                <tr
                  key={lesson.id}
                  className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="py-4 pr-4 text-gray-300">{lesson.date}</td>
                  <td className="py-4 pr-4 text-gray-300 font-medium">{lesson.subject}</td>
                  <td className="py-4 pr-4 text-gray-300">{lesson.tutor}</td>
                  <td className="py-4 pr-4 text-gray-300">{lesson.duration}</td>
                  <td className="py-4">
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(lesson.status)}`}>
                      {lesson.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="bg-gray-800 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-gray-400">No lessons found for the selected filter</p>
        </div>
      )}
    </div>
  );
}
















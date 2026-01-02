'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Feedback = {
  id: string;
  created_at: string;
  session_id: string;
  student_id: string;
  tutor_id: string;
  topic_covered: string;
  effort_level: 'low' | 'medium' | 'high';
  understanding_level: 'struggling' | 'improving' | 'strong';
  comment: string;
  student_name?: string;
  tutor_name?: string;
  subject_name?: string;
};

export default function ChildrenTutorFeedback({ childIds }: { childIds: string[] }) {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (childIds.length === 0) {
      setLoading(false);
      return;
    }
    fetchFeedback();
  }, [childIds]);

  async function fetchFeedback() {
    try {
      // Note: This assumes a tutor_feedback table exists
      // If it doesn't, this will show placeholder message
      const { data, error } = await supabase
        .from('tutor_feedback')
        .select('*')
        .in('student_id', childIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        // If table doesn't exist, just show empty state
        console.log('Tutor feedback table not yet implemented');
        setLoading(false);
        return;
      }

      // Enrich with student, tutor, and subject names
      const enrichedFeedback = await Promise.all(
        (data || []).map(async (fb) => {
          const [studentRes, tutorRes] = await Promise.all([
            supabase.from('profiles').select('full_name, display_name').eq('id', fb.student_id).single(),
            supabase.from('profiles').select('full_name, display_name, username').eq('id', fb.tutor_id).single()
          ]);

          return {
            ...fb,
            student_name: studentRes.data?.display_name || studentRes.data?.full_name || 'Unknown',
            tutor_name: tutorRes.data?.display_name || tutorRes.data?.full_name || tutorRes.data?.username || 'Unknown'
          };
        })
      );

      setFeedback(enrichedFeedback);
    } catch (error) {
      console.error('Error fetching feedback:', error);
    } finally {
      setLoading(false);
    }
  }

  const getEffortColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getUnderstandingColor = (level: string) => {
    switch (level) {
      case 'strong': return 'text-green-600 bg-green-100';
      case 'improving': return 'text-blue-600 bg-blue-100';
      case 'struggling': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return <p className="text-gray-600">Loading feedback...</p>;
  }

  if (feedback.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="bg-amber-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
          <svg className="h-8 w-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>
        <p className="text-gray-600">No tutor feedback yet</p>
        <p className="text-sm text-gray-500 mt-2">iTutors will provide feedback after completed sessions</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {feedback.map((fb) => (
        <div
          key={fb.id}
          className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-xl p-5 hover:border-amber-400 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-gray-900">{fb.student_name}</span>
                <span className="text-gray-500">•</span>
                <span className="text-sm text-gray-600">{fb.tutor_name}</span>
              </div>
              <p className="text-sm text-gray-500">
                {new Date(fb.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className="flex gap-2">
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getEffortColor(fb.effort_level)}`}>
                {fb.effort_level.charAt(0).toUpperCase() + fb.effort_level.slice(1)} Effort
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getUnderstandingColor(fb.understanding_level)}`}>
                {fb.understanding_level.charAt(0).toUpperCase() + fb.understanding_level.slice(1)}
              </span>
            </div>
          </div>
          
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-1">Topic Covered</h4>
            <p className="text-gray-900">{fb.topic_covered}</p>
          </div>

          <div className="bg-white/60 rounded-lg p-3 border border-amber-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-1">Tutor's Comment</h4>
            <p className="text-gray-800">{fb.comment}</p>
          </div>
        </div>
      ))}
    </div>
  );
}



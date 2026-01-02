'use client';

import { useState, useEffect } from 'react';
import { createLessonOffer } from '@/lib/services/lessonOffersService';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';

type SendOfferModalProps = {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
};

type TutorSubject = {
  id: string;
  subject_id: string;
  subjects: {
    id: string;
    name: string;
    label: string;
  };
};

export default function SendOfferModal({
  isOpen,
  onClose,
  studentId,
  studentName
}: SendOfferModalProps) {
  const { profile } = useProfile();
  const [tutorSubjects, setTutorSubjects] = useState<TutorSubject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('14:00');
  const [duration, setDuration] = useState(60);
  const [durationError, setDurationError] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch tutor's subjects when modal opens
  useEffect(() => {
    if (isOpen && profile?.id) {
      fetchTutorSubjects();
    }
  }, [isOpen, profile?.id]);

  async function fetchTutorSubjects() {
    setLoadingSubjects(true);
    setError(null);
    try {
      // Fetch tutor_subjects first
      const { data: tutorSubjectsData, error: tsError } = await supabase
        .from('tutor_subjects')
        .select('id, subject_id')
        .eq('tutor_id', profile!.id);

      if (tsError) {
        console.error('Error fetching tutor subjects:', tsError);
        throw new Error(tsError.message);
      }

      if (!tutorSubjectsData || tutorSubjectsData.length === 0) {
        setTutorSubjects([]);
        return;
      }

      // Get the subject IDs
      const subjectIds = tutorSubjectsData.map(ts => ts.subject_id);

      // Fetch the subject details separately
      const { data: subjectsData, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name, label')
        .in('id', subjectIds);

      if (subjectsError) {
        console.error('Error fetching subjects:', subjectsError);
        throw new Error(subjectsError.message);
      }

      // Combine the data
      const combined = tutorSubjectsData.map(ts => {
        const subject = subjectsData?.find(s => s.id === ts.subject_id);
        return {
          ...ts,
          subjects: subject || { id: ts.subject_id, name: 'Unknown', label: 'Unknown' }
        };
      });

      console.log('Fetched tutor subjects:', combined);
      setTutorSubjects(combined as TutorSubject[]);
    } catch (err) {
      console.error('Error fetching tutor subjects:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load your subjects';
      setError(errorMessage);
    } finally {
      setLoadingSubjects(false);
    }
  }

  const handleSend = async () => {
    if (!subjectId || !date || !time || !profile?.id) {
      setError('Please fill in all required fields');
      return;
    }

    // Validate duration
    if (duration < 30 || duration > 300) {
      setError('Duration must be between 30 minutes and 5 hours (300 minutes)');
      return;
    }

    setSending(true);
    setError(null);

    try {
      // Check if tutor has a video provider connected
      const { data: videoProvider, error: vpError } = await supabase
        .from('tutor_video_provider_connections')
        .select('id')
        .eq('tutor_id', profile.id)
        .limit(1)
        .single();

      if (vpError || !videoProvider) {
        setError('You must connect Google Meet or Zoom before sending lesson offers. Please go to Settings > Video Provider.');
        setSending(false);
        return;
      }

      // Calculate proposed start and end times
      const proposedStart = new Date(`${date}T${time}`);
      const proposedEnd = new Date(proposedStart.getTime() + duration * 60000);

      // Check for time conflicts with existing confirmed bookings
      const { data: conflictingBookings, error: checkError } = await supabase
        .from('bookings')
        .select('id, confirmed_start_at, confirmed_end_at')
        .eq('tutor_id', profile.id)
        .eq('status', 'CONFIRMED')
        .or(`and(confirmed_start_at.lt.${proposedEnd.toISOString()},confirmed_end_at.gt.${proposedStart.toISOString()})`);

      if (checkError) {
        console.error('Error checking conflicts:', checkError);
        throw new Error('Failed to check schedule conflicts');
      }

      if (conflictingBookings && conflictingBookings.length > 0) {
        setError('You have a class at this time. You cannot send a request to the student. Please cancel your class or pick a different time.');
        setSending(false);
        return;
      }

      // No conflicts - proceed to send the offer
      const result = await createLessonOffer(profile.id, {
        student_id: studentId,
        subject_id: subjectId,
        proposed_start_at: proposedStart.toISOString(),
        duration_minutes: duration,
        tutor_note: note.trim() || undefined
      });

      if (result.error) throw result.error;

      // Success - close modal and show success message
      handleClose();
      alert('Lesson offer sent successfully!');
    } catch (err) {
      console.error('Error sending offer:', err);
      setError(err instanceof Error ? err.message : 'Failed to send offer');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSubjectId('');
    setDate('');
    setTime('14:00');
    setDuration(60);
    setNote('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  // Get today's date for min date validation
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-itutor-green to-emerald-600">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Send Lesson Offer</h2>
              <p className="text-white/90 text-sm mt-1">to {studentName}</p>
            </div>
            <button
              onClick={handleClose}
              disabled={sending}
              className="text-white/80 hover:text-white transition disabled:opacity-50"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Subject Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Subject <span className="text-red-500">*</span>
            </label>
            {loadingSubjects ? (
              <div className="flex items-center gap-2 text-sm text-gray-600 py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-itutor-green"></div>
                Loading your subjects...
              </div>
            ) : tutorSubjects.length === 0 ? (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 mb-1">No subjects found</p>
                    <p className="text-sm text-gray-700 mb-3">You need to add subjects to your profile before sending lesson offers.</p>
                    <button
                      onClick={() => {
                        handleClose();
                        window.location.href = '/tutor/dashboard';
                      }}
                      className="text-sm font-medium text-itutor-green hover:text-emerald-600 underline"
                    >
                      Go to Dashboard to Add Subjects →
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
              >
                <option value="">Select a subject you teach...</option>
                {tutorSubjects.map((ts) => (
                  <option key={ts.id} value={ts.subject_id}>
                    {ts.subjects.label || ts.subjects.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={today}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Duration (minutes) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="30"
              max="300"
              step="15"
              value={duration}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 60;
                setDuration(val);
                if (val < 30) {
                  setDurationError('Minimum 30 minutes');
                } else if (val > 300) {
                  setDurationError('Maximum 5 hours (300 minutes)');
                } else {
                  setDurationError('');
                }
              }}
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
            />
            {durationError && <p className="text-red-600 text-sm mt-1">{durationError}</p>}
            <p className="text-xs text-gray-600 mt-1">
              {Math.floor(duration / 60)}h {duration % 60}m
              {duration === 60 && ' (1 hour)'}
              {duration === 90 && ' (1.5 hours)'}
              {duration === 120 && ' (2 hours)'}
            </p>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Note (Optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add any details about the lesson..."
              rows={3}
              maxLength={500}
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 resize-none"
            />
            <p className="text-xs text-gray-600 mt-1">{note.length}/500 characters</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={handleClose}
            disabled={sending}
            className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !subjectId || !date || !time}
            className="px-6 py-2.5 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Sending...</span>
              </>
            ) : (
              'Send Offer'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}



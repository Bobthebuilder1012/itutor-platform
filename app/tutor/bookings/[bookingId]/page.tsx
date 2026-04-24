'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { 
  getBooking, 
  getBookingMessages, 
  addBookingMessage,
  tutorConfirmBooking,
  tutorHealthCheckBeforeConfirm,
  tutorDeclineBooking,
  tutorCounterOffer,
  subscribeToBooking,
  subscribeToBookingMessages
} from '@/lib/services/bookingService';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import { Booking, BookingMessage, BookingMessageWithSender } from '@/lib/types/booking';
import { formatDateTime, formatTimeRange, getRelativeTime } from '@/lib/utils/calendar';
import { getBookingStatusColor, getBookingStatusLabel } from '@/lib/types/booking';
import SessionJoinButton from '@/components/sessions/SessionJoinButton';
import MarkNoShowButtonEnhanced from '@/components/sessions/MarkNoShowButtonEnhanced';
import { Session } from '@/lib/types/sessions';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { BOOKING_CANCELLATION_REASON_LABELS } from '@/lib/constants/bookingCancellationReasons';

export default function TutorBookingThreadPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const bookingId = params.bookingId as string;
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<BookingMessageWithSender[]>([]);
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineQuickReason, setDeclineQuickReason] = useState('');
  const [declineMessage, setDeclineMessage] = useState('');
  const [reconnectPrompt, setReconnectPrompt] = useState<{
    open: boolean;
    reason: string;
    checking: boolean;
    error: string;
  }>({
    open: false,
    reason: '',
    checking: false,
    error: '',
  });
  
  // Counter offer state
  const [showCounterOffer, setShowCounterOffer] = useState(false);
  const [counterDate, setCounterDate] = useState('');
  const [counterStartTime, setCounterStartTime] = useState('');
  const [counterEndTime, setCounterEndTime] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const meetingRetryAttempted = useRef(false);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    loadBookingData();
    
    // Set up real-time subscriptions
    const bookingChannel = subscribeToBooking(bookingId, (payload) => {
      console.log('Booking updated:', payload);
      loadBookingData();
    });

    const messagesChannel = subscribeToBookingMessages(bookingId, (payload) => {
      console.log('New message:', payload);
      loadMessages();
    });

    return () => {
      supabase.removeChannel(bookingChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [profile, profileLoading, router, bookingId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function loadBookingData() {
    try {
      const bookingData = await getBooking(bookingId);
      
      // Verify this is the tutor's booking
      if (bookingData.tutor_id !== profile?.id) {
        alert('Unauthorized access');
        router.push('/tutor/bookings');
        return;
      }

      setBooking(bookingData);
      setStudentId(bookingData.student_id);

      // Fetch student and subject details
      const [studentRes, subjectRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, display_name, full_name')
          .eq('id', bookingData.student_id)
          .single(),
        supabase
          .from('subjects')
          .select('name, label')
          .eq('id', bookingData.subject_id)
          .single()
      ]);

      if (studentRes.error) {
        console.error('Error fetching student profile:', studentRes.error);
        setStudentName('Unknown Student');
      } else {
        setStudentName(getDisplayName(studentRes.data));
      }

      setSubjectName(subjectRes.data?.label || subjectRes.data?.name || 'Unknown Subject');

      // Fetch session if booking is confirmed
      if (bookingData.status === 'CONFIRMED') {
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select('*')
          .eq('booking_id', bookingId)
          .single();
        if (!sessionError && sessionData) {
          setSession(sessionData as Session);
          if ((!sessionData.join_url || !sessionData.meeting_external_id) && !meetingRetryAttempted.current) {
            meetingRetryAttempted.current = true;
            try {
              await fetch('/api/sessions/create-for-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_id: bookingId })
              });
              const { data: refreshedSession } = await supabase
                .from('sessions')
                .select('*')
                .eq('booking_id', bookingId)
                .single();
              if (refreshedSession) {
                setSession(refreshedSession as Session);
              }
            } catch (retryError) {
              console.error('Meeting link retry failed:', retryError);
            }
          }
        } else {
          setSession(null);
        }
      } else {
        setSession(null);
      }

      await loadMessages();
    } catch (error) {
      console.error('Error loading booking:', error);
      alert('Failed to load booking details');
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages() {
    try {
      const messagesData = await getBookingMessages(bookingId);
      
      // Enrich with sender info
      const enrichedMessages: BookingMessageWithSender[] = await Promise.all(
        messagesData.map(async (msg) => {
          const { data: sender } = await supabase
            .from('profiles')
            .select('username, display_name, full_name, role')
            .eq('id', msg.sender_id)
            .single();

          return {
            ...msg,
            sender_name: sender ? getDisplayName(sender) : 'Unknown',
            sender_username: sender?.username,
            sender_role: sender?.role,
            is_own_message: msg.sender_id === profile?.id
          };
        })
      );

      setMessages(enrichedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  function getMinDateTime() {
    const now = new Date();
    now.setHours(now.getHours() + 1); // At least 1 hour from now
    return now.toISOString().slice(0, 16);
  }

  function getDefaultDateTime() {
    if (booking?.requested_start_at) {
      const requestedDate = new Date(booking.requested_start_at);
      return {
        date: requestedDate.toISOString().slice(0, 10),
        time: requestedDate.toISOString().slice(11, 16)
      };
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return {
      date: tomorrow.toISOString().slice(0, 10),
      time: '09:00'
    };
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      await addBookingMessage(bookingId, newMessage.trim());
      setNewMessage('');
      await loadMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  function handleConfirmBooking() {
    setShowConfirmModal(true);
  }

  async function submitConfirmBooking() {
    setShowConfirmModal(false);
    setActionLoading(true);
    try {
      const result = await tutorConfirmBooking(bookingId);
      if (result.sessionCreationWarning) {
        alert('✅ Booking confirmed, but session setup needs a retry. You can refresh and retry link generation.');
      }
      await loadBookingData();
    } catch (error: any) {
      console.error('Error confirming booking:', error);
      if (error?.code === 'VIDEO_PROVIDER_RECONNECT_REQUIRED') {
        const health = error?.health as any;
        setReconnectPrompt({
          open: true,
          reason: String(health?.reason || 'Authorization expired or invalid.'),
          checking: false,
          error: '',
        });
      } else if (error?.code === 'BOOKING_NO_LONGER_PENDING' || error?.code === 'BOOKING_CONFIRM_FAILED') {
        alert(error.message || 'Booking can no longer be confirmed.');
        await loadBookingData();
      } else {
        alert(error.message || 'Failed to confirm booking. The time slot may no longer be available.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReconnectRecheck() {
    setReconnectPrompt((prev) => ({ ...prev, checking: true, error: '' }));
    try {
      await tutorHealthCheckBeforeConfirm(bookingId);
      const result = await tutorConfirmBooking(bookingId);
      setReconnectPrompt((prev) => ({ ...prev, open: false, checking: false, error: '' }));
      if (result.sessionCreationWarning) {
        alert('✅ Booking confirmed, but session setup needs a retry. You can refresh and retry link generation.');
      }
      await loadBookingData();
    } catch (error: any) {
      console.error('Reconnect recheck failed:', error);
      if (error?.code === 'BOOKING_NO_LONGER_PENDING') {
        setReconnectPrompt((prev) => ({
          ...prev,
          checking: false,
          error: 'This booking is no longer pending, so it cannot be confirmed.',
        }));
      } else {
        setReconnectPrompt((prev) => ({
          ...prev,
          checking: false,
          error: error?.message || 'Connection still invalid. Please reconnect and try again.',
        }));
      }
    }
  }

  function openCenteredPopup(url: string, name: string, width: number, height: number): Window | null {
    if (typeof window === 'undefined') return null;
    const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));
    return window.open(
      url,
      name,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  }

  function handleConnectNow() {
    if (reconnectPrompt.checking) return;
    setReconnectPrompt((prev) => ({ ...prev, checking: true, error: '' }));

    const popup = openCenteredPopup('/tutor/video-setup', 'video-provider-setup', 920, 760);
    if (!popup) {
      setReconnectPrompt((prev) => ({
        ...prev,
        checking: false,
        error: 'Popup was blocked. Please allow popups and click Connect now again.',
      }));
      return;
    }

    const popupWatcher = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(popupWatcher);
      void handleReconnectRecheck();
    }, 700);
  }

  function handleDeclineBooking() {
    setDeclineQuickReason('');
    setDeclineMessage('');
    setShowDeclineModal(true);
  }

  async function submitDeclineBooking() {
    setShowDeclineModal(false);
    setActionLoading(true);
    const fullReason = [declineQuickReason, declineMessage].filter(Boolean).join(' — ') || undefined;
    try {
      await tutorDeclineBooking(bookingId, fullReason);
      await loadBookingData();
    } catch (error) {
      console.error('Error declining booking:', error);
      alert('Failed to decline booking');
    } finally {
      setActionLoading(false);
    }
  }

  async function submitTutorCancelBooking() {
    if (!cancelReason) {
      alert('Please select a reason for cancelling.');
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch('/api/bookings/tutor-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, reason: cancelReason.trim() }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        alert('Failed to cancel booking: ' + (errBody?.error || response.statusText));
      } else {
        alert('Booking cancelled');
        setCancelOpen(false);
        setCancelReason('');
      }
      await loadBookingData();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking');
    } finally {
      setActionLoading(false);
    }
  }
  function handleOpenCounterOffer() {
    const defaults = getDefaultDateTime();
    setCounterDate(defaults.date);
    setCounterStartTime(defaults.time);
    
    // Default end time is 1 hour after start
    const startDate = new Date(`${defaults.date}T${defaults.time}`);
    startDate.setHours(startDate.getHours() + 1);
    setCounterEndTime(startDate.toISOString().slice(11, 16));
    
    setShowCounterOffer(true);
  }

  async function handleSendCounterOffer() {
    if (!counterDate || !counterStartTime || !counterEndTime) {
      alert('Please fill in all time fields');
      return;
    }

    // Validate end time is after start time
    const startDateTime = new Date(`${counterDate}T${counterStartTime}`);
    const endDateTime = new Date(`${counterDate}T${counterEndTime}`);
    
    if (endDateTime <= startDateTime) {
      alert('End time must be after start time');
      return;
    }

    // Check minimum notice (at least 1 hour from now)
    const now = new Date();
    if (startDateTime < now) {
      alert('Cannot propose a time in the past');
      return;
    }

    setActionLoading(true);
    try {
      await tutorCounterOffer(
        bookingId,
        startDateTime.toISOString(),
        endDateTime.toISOString(),
        counterMessage || undefined
      );
      alert('Counter-offer sent!');
      setShowCounterOffer(false);
      setCounterDate('');
      setCounterStartTime('');
      setCounterEndTime('');
      setCounterMessage('');
      await loadBookingData();
    } catch (error: any) {
      console.error('Error sending counter-offer:', error);
      alert(error.message || 'Failed to send counter-offer. There may be a conflict with your existing bookings.');
    } finally {
      setActionLoading(false);
    }
  }

  if (profileLoading || loading || !profile || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const displayStartTime = booking.confirmed_start_at || booking.requested_start_at;
  const displayEndTime = booking.confirmed_end_at || booking.requested_end_at;
  const hasSessionStarted = displayStartTime ? new Date(displayStartTime) <= new Date() : false;
  const canRespond = booking.status === 'PENDING' || booking.status === 'COUNTER_PROPOSED';
  const canCancel = booking.status === 'CONFIRMED' && !hasSessionStarted;
  const paidClassesEnabled = isPaidClassesEnabled();
  const hasOutsideAvailabilityDisclaimer =
    (booking.student_notes ?? '').toLowerCase().includes('outside') &&
    (booking.student_notes ?? '').toLowerCase().includes('availability');
  const cleanedStudentNotes = (booking.student_notes ?? '')
    .replace(/"?\s*suggested outside listed availability\s*"?/i, '')
    .trim();

  return (
    <DashboardLayout role="tutor" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 text-itutor-green hover:text-emerald-400 flex items-center gap-2 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Bookings
        </button>

        {/* Booking Header */}
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-6 mb-6 shadow-sm">
          {hasOutsideAvailabilityDisclaimer && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Suggested outside of availability
              </p>
            </div>
          )}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">Session with {studentName}</h1>
                {studentId && studentName !== 'Unknown Student' && (
                  <button
                    onClick={() => router.push(`/tutor/students/${studentId}`)}
                    className="text-sm text-itutor-green hover:text-emerald-600 font-medium transition-colors flex items-center gap-1"
                  >
                    View Profile
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="text-gray-600">{subjectName}</p>
            </div>
            <span className={`
              px-3 py-1.5 rounded-lg text-sm font-semibold border flex-shrink-0
              ${getBookingStatusColor(booking.status)}
            `}>
              {getBookingStatusLabel(booking.status)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-700">
              <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <div className="font-medium">{formatDateTime(displayStartTime)}</div>
                <div className="text-gray-500 text-xs">{getRelativeTime(displayStartTime)}</div>
              </div>
            </div>

            {booking.duration_minutes && (
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="font-medium">
                    {booking.duration_minutes >= 60 
                      ? `${Math.floor(booking.duration_minutes / 60)}h ${booking.duration_minutes % 60 > 0 ? `${booking.duration_minutes % 60}m` : ''}`
                      : `${booking.duration_minutes} minutes`
                    }
                  </div>
                  <div className="text-gray-500 text-xs">Duration</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-gray-700">
              <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="font-medium">
                  {paidClassesEnabled ? `$${booking.price_ttd} TTD` : 'Free'}
                </div>
                <div className="text-gray-500 text-xs">
                  {paidClassesEnabled ? 'Payment' : 'No payment required'}
                </div>
              </div>
            </div>
          </div>

          {(hasOutsideAvailabilityDisclaimer || cleanedStudentNotes) && (
            <div className="mt-4 pt-4 border-t border-blue-200">
              <p className="text-sm text-gray-600 mb-1">Student's notes:</p>
              {cleanedStudentNotes ? (
                <p className="text-gray-900">{cleanedStudentNotes}</p>
              ) : (
                <p className="text-gray-500 text-sm">No additional notes.</p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {(canRespond || canCancel) && (
            <div className="mt-6 pt-6 border-t border-blue-200 flex flex-wrap gap-3">
              {canRespond && (
                <>
                  <button
                    onClick={handleConfirmBooking}
                    disabled={actionLoading}
                    className="flex-1 min-w-[150px] bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-3 px-4 rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    ✓ Accept Booking Request
                  </button>
                  <button
                    onClick={handleOpenCounterOffer}
                    disabled={actionLoading}
                    className="flex-1 min-w-[150px] bg-gray-700 hover:bg-gray-600 text-itutor-white py-3 px-4 rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    Propose Different Time
                  </button>
                  <button
                    onClick={handleDeclineBooking}
                    disabled={actionLoading}
                    className="flex-1 min-w-[150px] bg-red-900/30 hover:bg-red-900/50 text-red-400 py-3 px-4 rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    ✗ Decline
                  </button>
                </>
              )}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelReason('');
                    setCancelOpen(true);
                  }}
                  disabled={actionLoading}
                  className="flex-1 min-w-[150px] bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-semibold transition disabled:opacity-50"
                >
                  ✗ Cancel Booking
                </button>
              )}
            </div>
          )}
        </div>

        {cancelOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !actionLoading && setCancelOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel booking</h3>
              <p className="text-sm text-gray-600 mb-4">Select a reason. The student will be notified.</p>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full mb-4 rounded-lg border-2 border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Choose a reason…</option>
                {BOOKING_CANCELLATION_REASON_LABELS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setCancelOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={actionLoading || !cancelReason}
                  onClick={() => void submitTutorCancelBooking()}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Cancelling…' : 'Confirm cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Booking Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowConfirmModal(false)}>
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-gray-900">Confirm Booking Request</h3>
                <button onClick={() => setShowConfirmModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                You're about to accept this booking. The time slot will be blocked on your calendar and the student will be notified.
              </p>

              <div className="rounded-xl border border-gray-200 p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900">Session with {studentName}</p>
                  <span className="bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">{subjectName}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="flex items-start gap-1.5">
                    <svg className="w-4 h-4 text-itutor-green mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <div>
                      <p className="font-medium text-gray-900">{displayStartTime ? new Date(displayStartTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
                      <p className="text-xs text-gray-500">{displayStartTime ? new Date(displayStartTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <svg className="w-4 h-4 text-itutor-green mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div>
                      <p className="font-medium text-gray-900">{booking?.duration_minutes ? `${Math.floor(booking.duration_minutes / 60)}h${booking.duration_minutes % 60 ? ` ${booking.duration_minutes % 60}m` : ''}` : '—'}</p>
                      <p className="text-xs text-gray-500">Duration</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <svg className="w-4 h-4 text-itutor-green mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div>
                      <p className="font-medium text-gray-900">{paidClassesEnabled ? `$${booking?.price_ttd} TTD` : 'Free'}</p>
                      <p className="text-xs text-gray-500">No payment required</p>
                    </div>
                  </div>
                </div>
              </div>

              {hasOutsideAvailabilityDisclaimer && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mb-4">
                  <p className="text-xs text-amber-800"><span className="font-semibold">Note:</span> This slot falls outside your set availability window.</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setShowConfirmModal(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button onClick={submitConfirmBooking} disabled={actionLoading} className="flex-1 rounded-xl bg-itutor-green hover:bg-emerald-700 text-white py-2.5 text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  Confirm Booking
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Decline Booking Modal */}
        {showDeclineModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDeclineModal(false)}>
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-gray-900">Decline Booking Request</h3>
                <button onClick={() => setShowDeclineModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Let the student know why you're declining.{' '}
                <span className="text-itutor-green font-medium">This helps them find a better match.</span>
              </p>

              <p className="text-sm font-semibold text-gray-800 mb-2">Quick reasons</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {['Schedule conflict', 'Outside availability', 'Subject mismatch', 'Other'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDeclineQuickReason(declineQuickReason === r ? '' : r)}
                    className={`px-3 py-1.5 rounded-full border text-sm font-medium transition ${
                      declineQuickReason === r
                        ? 'border-red-500 bg-red-50 text-red-600'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <label className="block text-sm font-semibold text-gray-800 mb-1">
                Message <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={declineMessage}
                onChange={(e) => setDeclineMessage(e.target.value)}
                placeholder="Add a short note for the student..."
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none transition resize-none mb-4"
              />

              <div className="flex gap-3">
                <button onClick={() => setShowDeclineModal(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button onClick={submitDeclineBooking} disabled={actionLoading} className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white py-2.5 text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  Decline Booking
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Session Join & Controls */}
        {session && booking.status === 'CONFIRMED' && (
          <div className="mb-6 space-y-4">
            <SessionJoinButton session={session} userRole="tutor" />
            <MarkNoShowButtonEnhanced 
              session={session}
              userRole="tutor"
              onSuccess={() => {
                loadBookingData();
              }}
            />
          </div>
        )}

        {reconnectPrompt.open && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setReconnectPrompt((prev) => ({ ...prev, open: false, checking: false }))}
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-amber-300 bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-2 text-xl font-bold text-gray-900">Connect Zoom or Google Meet</h3>
              <p className="mb-3 text-sm text-gray-700">
                To accept this booking, you need to connect or reconnect your Google Meet or Zoom account.
              </p>
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {reconnectPrompt.reason}
              </p>
              <p className="mb-4 text-xs text-gray-600">
                After you finish connecting in the pop-up, we will confirm this booking automatically.
              </p>
              {reconnectPrompt.error && (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {reconnectPrompt.error}
                </p>
              )}
              <div className="flex">
                <button
                  onClick={handleConnectNow}
                  disabled={reconnectPrompt.checking}
                  className="rounded-lg bg-itutor-green px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                >
                  {reconnectPrompt.checking ? 'Waiting for connection...' : 'Connect now'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Counter Offer Modal */}
        {showCounterOffer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCounterOffer(false)}>
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-gray-900">Propose Alternative Time</h3>
                <button onClick={() => setShowCounterOffer(false)} className="text-gray-400 hover:text-gray-600 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Suggest a time that works better for you. The student will be notified and can accept or decline.
              </p>

              <div className="rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={counterDate}
                    onChange={(e) => setCounterDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Start Time</label>
                    <input
                      type="time"
                      value={counterStartTime}
                      onChange={(e) => setCounterStartTime(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">End Time</label>
                    <input
                      type="time"
                      value={counterEndTime}
                      onChange={(e) => setCounterEndTime(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Message <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  placeholder="Explain why you're proposing this time..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCounterOffer(false)}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendCounterOffer}
                  disabled={actionLoading || !counterDate || !counterStartTime || !counterEndTime}
                  className="flex-1 rounded-xl bg-itutor-green hover:bg-emerald-700 text-white py-2.5 text-sm font-semibold transition disabled:opacity-50"
                >
                  {actionLoading ? 'Sending...' : 'Send Counter-Offer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Messages Thread */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-900">Messages</h2>
          </div>

          {/* Messages List */}
          <div className="h-96 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No messages yet
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.message_type === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="bg-blue-50 px-4 py-2 rounded-full text-xs text-blue-600 border border-blue-200">
                        {msg.body}
                      </div>
                    </div>
                  );
                }

                if (msg.message_type === 'time_proposal') {
                  return (
                    <div key={msg.id} className={`flex ${msg.is_own_message ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-md">
                        <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-semibold text-blue-700">Alternative Time Proposed</span>
                          </div>
                          <p className="text-gray-900 font-medium mb-1">
                            {formatDateTime(msg.proposed_start_at!)}
                          </p>
                          <p className="text-gray-600 text-sm mb-3">
                            {formatTimeRange(msg.proposed_start_at!, msg.proposed_end_at!)}
                          </p>
                          {msg.body && (
                            <p className="text-gray-700 text-sm">{msg.body}</p>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 px-2">
                          {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </p>
                      </div>
                    </div>
                  );
                }

                // Regular text message
                return (
                  <div key={msg.id} className={`flex ${msg.is_own_message ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-md">
                      <div className={`rounded-lg p-3 ${
                        msg.is_own_message
                          ? 'bg-itutor-green text-white'
                          : 'bg-white border border-gray-300 text-gray-900'
                      }`}>
                        <p>{msg.body}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 px-2">
                        {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          {booking.status !== 'CANCELLED' && booking.status !== 'DECLINED' && (
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white px-6 py-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}


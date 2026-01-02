'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { 
  getBooking, 
  getBookingMessages, 
  addBookingMessage,
  studentAcceptCounter,
  studentCancelBooking,
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
import { Session } from '@/lib/types/sessions';

export default function BookingThreadPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const bookingId = params.bookingId as string;
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<BookingMessageWithSender[]>([]);
  const [tutorName, setTutorName] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'student') {
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
      
      // Verify this is the student's booking
      if (bookingData.student_id !== profile?.id) {
        alert('Unauthorized access');
        router.push('/student/bookings');
        return;
      }

      setBooking(bookingData);

      // Fetch tutor and subject details
      const [tutorRes, subjectRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, display_name, full_name')
          .eq('id', bookingData.tutor_id)
          .single(),
        supabase
          .from('subjects')
          .select('name, label')
          .eq('id', bookingData.subject_id)
          .single()
      ]);

      setTutorName(tutorRes.data ? getDisplayName(tutorRes.data) : 'Unknown Tutor');
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
        }
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

  async function handleAcceptCounter(messageId: string) {
    if (!confirm('Accept this proposed time? This will confirm your booking.')) return;

    setActionLoading(true);
    try {
      await studentAcceptCounter(bookingId, messageId);
      
      // Automatically create session for confirmed booking
      try {
        const response = await fetch('/api/sessions/create-for-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId })
        });
        
        if (!response.ok) {
          console.error('Failed to create session:', await response.text());
          // Don't fail the confirmation if session creation fails - user can still use booking
        }
      } catch (sessionError) {
        console.error('Error creating session:', sessionError);
        // Continue - session can be created later
      }
      
      alert('Counter-offer accepted! Your booking is confirmed.');
      await loadBookingData();
    } catch (error: any) {
      console.error('Error accepting counter:', error);
      alert(error.message || 'Failed to accept counter-offer');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelBooking() {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    setActionLoading(true);
    try {
      await studentCancelBooking(bookingId, 'Cancelled by student');
      alert('Booking cancelled');
      await loadBookingData();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking');
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
  const canCancel = booking.status === 'PENDING' || booking.status === 'COUNTER_PROPOSED' || booking.status === 'CONFIRMED';

  return (
    <DashboardLayout role="student" userName={getDisplayName(profile)}>
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
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-itutor-white mb-2">Booking with {tutorName}</h1>
              <p className="text-gray-400">{subjectName}</p>
            </div>
            <span className={`
              px-3 py-1.5 rounded-lg text-sm font-semibold border
              ${getBookingStatusColor(booking.status)}
            `}>
              {getBookingStatusLabel(booking.status)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-300">
              <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <div className="font-medium">{formatDateTime(displayStartTime)}</div>
                <div className="text-gray-500 text-xs">{getRelativeTime(displayStartTime)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-gray-300">
              <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="font-medium">
                  {(() => {
                    const endTime = booking.confirmed_end_at || booking.requested_end_at;
                    if (displayStartTime && endTime) {
                      const durationMs = new Date(endTime).getTime() - new Date(displayStartTime).getTime();
                      const durationMinutes = Math.round(durationMs / 60000);
                      const hours = Math.floor(durationMinutes / 60);
                      const mins = durationMinutes % 60;
                      return hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
                    }
                    return '60 min';
                  })()}
                </div>
                <div className="text-gray-500 text-xs">Duration</div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-gray-300">
              <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="font-medium">${booking.price_ttd} TTD</div>
                <div className="text-gray-500 text-xs">Total price</div>
              </div>
            </div>
          </div>

          {booking.student_notes && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <p className="text-sm text-gray-400 mb-1">Your notes:</p>
              <p className="text-gray-300">{booking.student_notes}</p>
            </div>
          )}

          {/* Cancel Button */}
          {canCancel && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <button
                onClick={handleCancelBooking}
                disabled={actionLoading}
                className="text-red-400 hover:text-red-300 font-medium text-sm transition disabled:opacity-50"
              >
                Cancel Booking
              </button>
            </div>
          )}
        </div>

        {/* Session Join Button */}
        {session && booking.status === 'CONFIRMED' && (
          <div className="mb-6">
            <SessionJoinButton session={session} userRole="student" />
          </div>
        )}

        {/* Messages Thread */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-bold text-itutor-white">Messages</h2>
          </div>

          {/* Messages List */}
          <div className="h-96 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No messages yet
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.message_type === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="bg-gray-700/50 px-4 py-2 rounded-full text-xs text-gray-400">
                        {msg.body}
                      </div>
                    </div>
                  );
                }

                if (msg.message_type === 'time_proposal') {
                  return (
                    <div key={msg.id} className={`flex ${msg.is_own_message ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-md">
                        <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-semibold text-blue-400">Alternative Time Proposed</span>
                          </div>
                          <p className="text-itutor-white font-medium mb-1">
                            {formatDateTime(msg.proposed_start_at!)}
                          </p>
                          <p className="text-gray-400 text-sm mb-3">
                            {formatTimeRange(msg.proposed_start_at!, msg.proposed_end_at!)}
                          </p>
                          {msg.body && (
                            <p className="text-gray-300 text-sm mb-3">{msg.body}</p>
                          )}
                          {!msg.is_own_message && booking.status === 'COUNTER_PROPOSED' && (
                            <button
                              onClick={() => handleAcceptCounter(msg.id)}
                              disabled={actionLoading}
                              className="w-full bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-2 px-4 rounded-lg font-semibold transition disabled:opacity-50"
                            >
                              Accept This Time
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 px-2">
                          {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString()}
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
                          : 'bg-gray-700 text-gray-100'
                      }`}>
                        <p>{msg.body}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 px-2">
                        {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          {booking.status !== 'CANCELLED' && booking.status !== 'DECLINED' && booking.status !== 'COMPLETED' && (
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 text-itutor-white rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-500 disabled:opacity-50"
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



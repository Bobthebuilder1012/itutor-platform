'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { getStudentBookings } from '@/lib/services/bookingService';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import type { BookingWithDetails } from '@/lib/types/booking';
import { getBookingStatusLabel } from '@/lib/types/booking';
import { formatDateTime } from '@/lib/utils/calendar';
import { Calendar, Video, MoreHorizontal, RotateCcw, Star, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabType = 'upcoming' | 'past';

export default function StudentBookingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');
  const [paidClassesEnabled, setPaidClassesEnabled] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'student') { router.push('/login'); return; }
    fetchPaidClassesFlag();
    loadBookings();
  }, [profile, profileLoading, router]);

  async function fetchPaidClassesFlag() {
    try {
      const res = await fetch('/api/feature-flags', { cache: 'no-store' });
      const data = await res.json();
      setPaidClassesEnabled(Boolean(data?.paidClassesEnabled));
    } catch { setPaidClassesEnabled(false); }
  }

  async function loadBookings() {
    if (!profile) return;
    setLoading(true);
    try {
      const data = await getStudentBookings(profile.id);
      const enriched = await Promise.all(data.map(async (booking) => {
        const [tutorRes, subjectRes, sessionRes] = await Promise.all([
          supabase.from('profiles').select('username, display_name, full_name').eq('id', booking.tutor_id).single(),
          supabase.from('subjects').select('name, label').eq('id', booking.subject_id).single(),
          supabase.from('sessions').select('id, status, join_url, scheduled_start_at, scheduled_end_at, duration_minutes').eq('booking_id', booking.id).single(),
        ]);
        return {
          ...booking,
          tutor_name: tutorRes.data ? getDisplayName(tutorRes.data) : 'Unknown Tutor',
          tutor_username: tutorRes.data?.username,
          subject_name: subjectRes.data?.label || subjectRes.data?.name || 'Unknown Subject',
          session: sessionRes.data || null,
        } as BookingWithDetails & { session: any };
      }));
      setBookings(enriched);
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  const isBookingPast = (booking: any) => {
    if (booking.status === 'COMPLETED' || booking.status === 'COMPLETED_ASSUMED' || booking.status === 'DECLINED' || booking.status === 'CANCELLED') return true;
    // Use the most reliable end-time we have: live session > confirmed_end_at > requested_end_at.
    // This catches PENDING / CONFIRMED rows whose slot has already elapsed.
    const endIso =
      booking.session?.scheduled_end_at ||
      booking.confirmed_end_at ||
      booking.requested_end_at;
    if (endIso) return new Date() > new Date(endIso);
    return false;
  };

  const isBookingSoon = (booking: any) => {
    if (booking.status !== 'CONFIRMED' || !booking.session) return false;
    const start = new Date(booking.session.scheduled_start_at);
    const now = new Date();
    return start > now && (start.getTime() - now.getTime()) < 60 * 60 * 1000;
  };

  // Legacy "ghost" bookings created by the old direct-book flow: status=PENDING
  // with payment_required=true but never paid. The new flow no longer creates
  // these — we hide them so the student doesn't see orphan rows the tutor
  // never approved. Truly tutor-pending paid bookings (payment_status='paid')
  // stay visible.
  const isUnpaidGhost = (b: any) =>
    b.status === 'PENDING' && b.payment_required && b.payment_status !== 'paid';

  const visible = bookings.filter((b) => !isUnpaidGhost(b));
  const upcoming = visible.filter(b => !isBookingPast(b) && b.status !== 'CANCELLED');
  const past = visible.filter(b => isBookingPast(b));

  const displayed = activeTab === 'upcoming' ? upcoming : past;

  const getStatusConfig = (booking: any) => {
    if (booking.status === 'CANCELLED') return { label: 'Cancelled', cls: 'bg-muted text-muted-foreground' };
    if (booking.status === 'COMPLETED' || booking.status === 'COMPLETED_ASSUMED') return { label: 'Completed', cls: 'bg-brand-soft text-forest' };
    // Anything past its scheduled end-time but never marked completed:
    // surface as "Past" rather than the stale lifecycle status (PENDING/CONFIRMED).
    if (isBookingPast(booking)) return { label: 'Past', cls: 'bg-muted text-muted-foreground' };
    if (isBookingSoon(booking)) return { label: 'Starts soon', cls: 'bg-coral-soft text-coral' };
    if (booking.status === 'CONFIRMED') return { label: 'Scheduled', cls: 'bg-sky/40 text-forest' };
    if (booking.status === 'PENDING') return { label: 'Pending', cls: 'bg-peach text-ink' };
    return { label: getBookingStatusLabel(booking.status), cls: 'bg-muted text-muted-foreground' };
  };

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
    { key: 'past', label: 'Past', count: past.length },
  ];

  if (profileLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">My bookings</h1>
        <p className="text-sm text-muted-foreground mt-1">All your lessons in one place</p>
      </div>

      {/* Tabs */}
      <div className="inline-flex bg-background border border-border p-1 h-11 rounded-2xl gap-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'rounded-xl px-4 py-1.5 text-sm font-medium transition',
              activeTab === tab.key ? 'bg-brand-soft text-forest shadow-sm' : 'text-muted-foreground hover:text-ink'
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold', activeTab === tab.key ? 'bg-brand-deep/20' : 'bg-muted')}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Upcoming / Past content */}
      {(loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 rounded-3xl bg-background border border-border">
          <div className="size-14 mx-auto rounded-2xl bg-brand-soft grid place-items-center mb-3">
            <Calendar className="size-6 text-brand-deep" />
          </div>
          <p className="font-semibold text-ink">No bookings found</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            {activeTab === 'upcoming' ? "You don't have any upcoming lessons." : "No bookings in this category."}
          </p>
          <Link href="/student/find-tutors" className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
            Find a tutor
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((booking) => {
            const displayTime = (booking as any).session?.scheduled_start_at || (booking as any).confirmed_start_at || (booking as any).requested_start_at;
            const { label: statusLabel, cls: statusCls } = getStatusConfig(booking);
            const past = isBookingPast(booking);
            const soon = isBookingSoon(booking);
            const initials = ((booking as any).tutor_name || 'T').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

            return (
              <div key={booking.id} className="rounded-2xl bg-background border border-border p-4 hover:shadow-card transition">
                <div className="flex items-start gap-4">
                  <div className="size-12 rounded-2xl bg-gradient-to-br from-brand to-brand-deep grid place-items-center text-white font-semibold flex-shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-ink truncate">{(booking as any).subject_name}</h3>
                      <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider', statusCls)}>{statusLabel}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{(booking as any).tutor_name}</div>
                    {displayTime && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                        <Calendar className="size-3.5" /> {formatDateTime(displayTime)}
                      </div>
                    )}
                    {paidClassesEnabled && (booking as any).price_ttd && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Clock className="size-3.5" /> TT${(booking as any).price_ttd}
                      </div>
                    )}
                  </div>
                  <Link href={`/student/bookings/${booking.id}`} className="size-8 grid place-items-center rounded-full hover:bg-muted text-muted-foreground">
                    <MoreHorizontal className="size-4" />
                  </Link>
                </div>
                <div className="flex gap-2 mt-4">
                  {!past && soon && (
                    (booking as any).session?.join_url ? (
                      <a
                        href={(booking as any).session.join_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-deep"
                      >
                        <Video className="size-4" /> Join now
                      </a>
                    ) : (
                      <span className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-muted-foreground font-semibold text-sm cursor-default">
                        <Video className="size-4" /> Link generating…
                      </span>
                    )
                  )}
                  {!past && !soon && booking.status === 'CONFIRMED' && (
                    <Link href={`/student/bookings/${booking.id}`} className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-border font-semibold text-sm hover:bg-muted">
                      View details
                    </Link>
                  )}
                  {past && ((booking.status as string) === 'COMPLETED' || (booking.status as string) === 'COMPLETED_ASSUMED') && (
                    <>
                      {(booking as any).session?.id ? (
                        <Link
                          href={`/feedback/student/${(booking as any).session.id}`}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-coral-soft text-coral font-semibold text-sm hover:bg-coral hover:text-white"
                        >
                          <Star className="size-4" /> Rate session
                        </Link>
                      ) : (
                        <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-coral-soft text-coral font-semibold text-sm opacity-50 cursor-default">
                          <Star className="size-4" /> Rate session
                        </button>
                      )}
                      <Link href={`/student/find-tutors`} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border font-semibold text-sm hover:bg-muted">
                        <RotateCcw className="size-4" /> Rebook
                      </Link>
                    </>
                  )}
                  {booking.status === 'PENDING' && (
                    <Link href={`/student/bookings/${booking.id}`} className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-border font-semibold text-sm hover:bg-muted">
                      View request
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Loads the names and labels every booking-request surface and email needs.
//
// One loader rather than a copy in each route, because the same request is
// described to four different people (parent queue, parent email, student
// pending section, student email) and they must not disagree about the tutor's
// name, the subject or the time.

import type { SupabaseClient } from '@supabase/supabase-js';

export type RequestContext = {
  booking: {
    id: string;
    student_id: string;
    tutor_id: string;
    subject_id: string;
    status: string;
    requested_start_at: string;
    requested_end_at: string;
    duration_minutes: number;
    price_ttd: number | null;
    frozen_price: number | null;
    frozen_platform_fee: number | null;
    expires_at: string | null;
    checkout_session_id: string | null;
    payer_id: string | null;
    requested_at: string | null;
  };
  student: { id: string; name: string; email: string | null };
  tutor: { id: string; name: string };
  parent: { id: string; name: string; email: string | null } | null;
  subjectLabel: string;
  whenLabel: string;
  closesAtLabel: string | null;
  /** The figure the parent agreed to (decision 10), falling back to price_ttd. */
  amountTtd: number;
};

// Kept as ONE literal string, not a concatenation. The Supabase client infers
// the row type from the literal text of the select, so a runtime-built string
// collapses to GenericStringError and every field access below stops
// type-checking. Same reason the other selects in this file are inline.
const BOOKING_COLUMNS =
  'id, student_id, tutor_id, subject_id, status, requested_start_at, requested_end_at, duration_minutes, price_ttd, frozen_price, frozen_platform_fee, expires_at, checkout_session_id, payer_id, requested_at' as const;

type BookingRow = RequestContext['booking'];
type ProfileRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  username: string | null;
  email: string | null;
};

function nameOf(p?: { display_name?: string | null; full_name?: string | null; username?: string | null } | null): string {
  if (!p) return 'Unknown';
  return p.display_name || p.full_name || p.username || 'Unknown';
}

/**
 * Trinidad reads dates day-first, and the platform's audience is entirely
 * Trinidadian, so en-TT with an explicit Port of Spain zone — not the server's
 * zone, which on Vercel is UTC and would show a 6pm class as 10pm.
 */
export function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-TT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Port_of_Spain',
    });
  } catch {
    return iso;
  }
}

export async function loadRequestContext(
  admin: SupabaseClient,
  bookingId: string
): Promise<RequestContext | null> {
  const { data: bookingData } = await admin
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('id', bookingId)
    .maybeSingle();

  if (!bookingData) return null;
  // The generated Database types predate migration 219's columns, so the row is
  // narrowed here rather than regenerating a shared file mid-flight.
  const booking = bookingData as unknown as BookingRow;

  const ids = [booking.student_id, booking.tutor_id, booking.payer_id].filter(Boolean) as string[];

  const { data: profileData } = await admin
    .from('profiles')
    .select('id, full_name, display_name, username, email')
    .in('id', Array.from(new Set(ids)));

  const profiles = (profileData ?? []) as unknown as ProfileRow[];
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const studentRow = byId.get(booking.student_id);
  const tutorRow = byId.get(booking.tutor_id);
  const parentRow = booking.payer_id ? byId.get(booking.payer_id) : null;

  // Subjects carry both a name and a label in this schema, and which one is
  // populated varies by row, so both are asked for.
  let subjectLabel = 'Tutoring session';
  if (booking.subject_id) {
    const { data: subject } = await admin
      .from('subjects')
      .select('name, label')
      .eq('id', booking.subject_id)
      .maybeSingle();
    subjectLabel = subject?.label || subject?.name || subjectLabel;
  }

  const amountTtd = Number(booking.frozen_price ?? booking.price_ttd ?? 0);

  return {
    booking,
    student: {
      id: booking.student_id,
      name: nameOf(studentRow),
      email: studentRow?.email ?? null,
    },
    tutor: { id: booking.tutor_id, name: nameOf(tutorRow) },
    parent: parentRow
      ? { id: parentRow.id, name: nameOf(parentRow), email: parentRow.email ?? null }
      : null,
    subjectLabel,
    whenLabel: formatWhen(booking.requested_start_at),
    closesAtLabel: booking.expires_at ? formatWhen(booking.expires_at) : null,
    amountTtd,
  };
}

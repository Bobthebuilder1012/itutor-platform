import { getServiceClient } from '@/lib/supabase/server';
import { ParentAccessError } from '@/lib/server/parentAccess';

type LinkedChildRow = {
  child_id: string;
  child_color: string | null;
  child_profile:
    | {
        id: string;
        full_name: string | null;
        display_name: string | null;
        email: string | null;
        school: string | null;
        form_level: string | null;
        subjects_of_study: string[] | null;
      }
    | Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
        email: string | null;
        school: string | null;
        form_level: string | null;
        subjects_of_study: string[] | null;
      }>
    | null;
};

type BookingRow = {
  id: string;
  student_id: string;
  tutor_id: string;
  subject_id: string;
  status: string;
  price_ttd: number | null;
  payment_status: string | null;
  payer_id: string | null;
  requested_start_at: string;
  confirmed_start_at: string | null;
  duration_minutes: number | null;
  created_at: string;
};

type SessionRow = {
  id: string;
  booking_id: string;
  student_id: string;
  tutor_id: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  duration_minutes: number;
  created_at: string;
};

type PaymentRow = {
  id: string;
  booking_id: string;
  payer_id: string;
  amount_ttd: number;
  status: string;
  created_at: string;
};

type ProfileNameRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  username?: string | null;
};

type SubjectRow = {
  id: string;
  name: string | null;
  label: string | null;
};

function displayName(profile?: ProfileNameRow | null): string {
  if (!profile) return 'Unknown';
  return profile.display_name || profile.full_name || profile.username || 'Unknown';
}

function subjectName(subject?: SubjectRow | null): string {
  if (!subject) return 'Tutoring Session';
  return subject.label || subject.name || 'Tutoring Session';
}

function getChildProfile(row?: LinkedChildRow | null) {
  if (!row?.child_profile) {
    return null;
  }

  return Array.isArray(row.child_profile) ? row.child_profile[0] ?? null : row.child_profile;
}

function isUpcomingSession(session: SessionRow): boolean {
  return (
    ['SCHEDULED', 'JOIN_OPEN'].includes(session.status) &&
    new Date(session.scheduled_start_at).getTime() >= Date.now()
  );
}

function hasActiveClass(booking: BookingRow): boolean {
  return !['DECLINED', 'CANCELLED', 'PARENT_REJECTED'].includes(booking.status);
}

export async function getParentDashboardData(parentId: string) {
  const admin = getServiceClient();

  const { data: childLinks, error: childLinksError } = await admin
    .from('parent_child_links')
    .select(
      `child_id, child_color, child_profile:profiles!parent_child_links_child_id_fkey(
        id,
        full_name,
        display_name,
        email,
        school,
        form_level,
        subjects_of_study
      )`
    )
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true });

  if (childLinksError) {
    throw new ParentAccessError('Failed to load parent dashboard', 500);
  }

  const linkedChildren = ((childLinks ?? []) as unknown as LinkedChildRow[]).map((row) => ({
    ...row,
    child_profile: getChildProfile(row),
  }));
  const childIds = linkedChildren.map((child) => child.child_id);

  if (childIds.length === 0) {
    return {
      overview: {
        totalChildren: 0,
        totalSessionsBooked: 0,
        totalPaymentsMade: 0,
        totalPaymentsAmount: 0,
        upcomingSessions: 0,
      },
      children: [],
      upcomingSessions: [],
      recentBookings: [],
      recentPayments: [],
    };
  }

  const [{ data: bookings, error: bookingsError }, { data: sessions, error: sessionsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      admin
        .from('bookings')
        .select(
          'id, student_id, tutor_id, subject_id, status, price_ttd, payment_status, payer_id, requested_start_at, confirmed_start_at, duration_minutes, created_at'
        )
        .in('student_id', childIds)
        .order('created_at', { ascending: false }),
      admin
        .from('sessions')
        .select(
          'id, booking_id, student_id, tutor_id, status, scheduled_start_at, scheduled_end_at, duration_minutes, created_at'
        )
        .in('student_id', childIds)
        .order('scheduled_start_at', { ascending: true }),
      admin
        .from('payments')
        .select('id, booking_id, payer_id, amount_ttd, status, created_at')
        .eq('payer_id', parentId)
        .order('created_at', { ascending: false }),
    ]);

  if (bookingsError || sessionsError || paymentsError) {
    throw new ParentAccessError('Failed to load parent dashboard details', 500);
  }

  const bookingRows = (bookings ?? []) as BookingRow[];
  const sessionRows = (sessions ?? []) as SessionRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];

  const tutorIds = [...new Set([...bookingRows.map((row) => row.tutor_id), ...sessionRows.map((row) => row.tutor_id)])];
  const subjectIds = [...new Set(bookingRows.map((row) => row.subject_id).filter(Boolean))];

  const [{ data: tutors }, { data: subjects }] = await Promise.all([
    tutorIds.length > 0
      ? admin.from('profiles').select('id, full_name, display_name, username').in('id', tutorIds)
      : Promise.resolve({ data: [] as ProfileNameRow[] }),
    subjectIds.length > 0
      ? admin.from('subjects').select('id, name, label').in('id', subjectIds)
      : Promise.resolve({ data: [] as SubjectRow[] }),
  ]);

  const tutorMap = new Map((tutors ?? []).map((row) => [row.id, row as ProfileNameRow]));
  const subjectMap = new Map((subjects ?? []).map((row) => [row.id, row as SubjectRow]));
  const bookingMap = new Map(bookingRows.map((row) => [row.id, row]));

  const upcomingSessions = sessionRows
    .filter(isUpcomingSession)
    .slice(0, 6)
    .map((session) => {
      const child = linkedChildren.find((entry) => entry.child_id === session.student_id)?.child_profile;
      const booking = bookingMap.get(session.booking_id);
      return {
        id: session.id,
        childId: session.student_id,
        childName: displayName(child as ProfileNameRow),
        tutorName: displayName(tutorMap.get(session.tutor_id)),
        subjectName: subjectName(booking ? subjectMap.get(booking.subject_id) : null),
        scheduledStartAt: session.scheduled_start_at,
        scheduledEndAt: session.scheduled_end_at,
        durationMinutes: session.duration_minutes,
        status: session.status,
        bookingId: session.booking_id,
      };
    });

  const recentBookings = bookingRows.slice(0, 6).map((booking) => {
    const child = linkedChildren.find((entry) => entry.child_id === booking.student_id)?.child_profile;
    return {
      id: booking.id,
      childId: booking.student_id,
      childName: displayName(child as ProfileNameRow),
      tutorName: displayName(tutorMap.get(booking.tutor_id)),
      subjectName: subjectName(subjectMap.get(booking.subject_id)),
      status: booking.status,
      requestedStartAt: booking.requested_start_at,
      confirmedStartAt: booking.confirmed_start_at,
      durationMinutes: booking.duration_minutes ?? 60,
      priceTtd: booking.price_ttd ?? 0,
    };
  });

  const successfulPayments = paymentRows.filter((payment) => payment.status === 'succeeded');
  const recentPayments = successfulPayments.slice(0, 6).map((payment) => {
    const booking = bookingMap.get(payment.booking_id);
    const child = booking
      ? linkedChildren.find((entry) => entry.child_id === booking.student_id)?.child_profile
      : null;

    return {
      id: payment.id,
      bookingId: payment.booking_id,
      childName: displayName(child as ProfileNameRow),
      tutorName: booking ? displayName(tutorMap.get(booking.tutor_id)) : 'Unknown',
      subjectName: booking ? subjectName(subjectMap.get(booking.subject_id)) : 'Tutoring Session',
      amountTtd: payment.amount_ttd,
      createdAt: payment.created_at,
      status: payment.status,
    };
  });

  const children = linkedChildren.map((link) => {
    const childBookings = bookingRows.filter((booking) => booking.student_id === link.child_id);
    const childSessions = sessionRows.filter((session) => session.student_id === link.child_id);
    const childUpcomingSessions = childSessions.filter(isUpcomingSession);
    const classKeys = new Set(
      childBookings
        .filter(hasActiveClass)
        .map((booking) => `${booking.subject_id}:${booking.tutor_id}`)
    );

    return {
      id: link.child_id,
      color: link.child_color || '#9333EA',
      fullName: getChildProfile(link)?.full_name || 'Student',
      displayName: getChildProfile(link)?.display_name || null,
      email: getChildProfile(link)?.email || null,
      school: getChildProfile(link)?.school || null,
      formLevel: getChildProfile(link)?.form_level || null,
      subjectsOfStudy: getChildProfile(link)?.subjects_of_study || [],
      stats: {
        classes: classKeys.size,
        bookings: childBookings.length,
        upcomingSessions: childUpcomingSessions.length,
      },
    };
  });

  return {
    overview: {
      totalChildren: children.length,
      totalSessionsBooked: bookingRows.length,
      totalPaymentsMade: successfulPayments.length,
      totalPaymentsAmount: successfulPayments.reduce(
        (sum, payment) => sum + Number(payment.amount_ttd || 0),
        0
      ),
      upcomingSessions: sessionRows.filter(isUpcomingSession).length,
    },
    children,
    upcomingSessions,
    recentBookings,
    recentPayments,
  };
}

export async function getParentChildDetail(parentId: string, childId: string) {
  const admin = getServiceClient();

  const { data: childLink, error: childLinkError } = await admin
    .from('parent_child_links')
    .select(
      `child_id, child_color, child_profile:profiles!parent_child_links_child_id_fkey(
        id,
        full_name,
        display_name,
        email,
        school,
        form_level,
        subjects_of_study
      )`
    )
    .eq('parent_id', parentId)
    .eq('child_id', childId)
    .maybeSingle();

  if (childLinkError) {
    throw new ParentAccessError('Failed to load child details', 500);
  }

  const normalizedChildProfile = getChildProfile(
    (childLink as unknown as LinkedChildRow | null) ?? null
  );

  if (!normalizedChildProfile) {
    throw new ParentAccessError('Child not found', 404);
  }

  const [{ data: bookings }, { data: sessions }] = await Promise.all([
    admin
      .from('bookings')
      .select(
        'id, student_id, tutor_id, subject_id, status, price_ttd, payment_status, payer_id, requested_start_at, confirmed_start_at, duration_minutes, created_at'
      )
      .eq('student_id', childId)
      .order('created_at', { ascending: false }),
    admin
      .from('sessions')
      .select(
        'id, booking_id, student_id, tutor_id, status, scheduled_start_at, scheduled_end_at, duration_minutes, created_at'
      )
      .eq('student_id', childId)
      .order('scheduled_start_at', { ascending: true }),
  ]);

  const bookingRows = (bookings ?? []) as BookingRow[];
  const sessionRows = (sessions ?? []) as SessionRow[];
  const tutorIds = [...new Set([...bookingRows.map((row) => row.tutor_id), ...sessionRows.map((row) => row.tutor_id)])];
  const subjectIds = [...new Set(bookingRows.map((row) => row.subject_id).filter(Boolean))];

  const [{ data: tutors }, { data: subjects }] = await Promise.all([
    tutorIds.length > 0
      ? admin.from('profiles').select('id, full_name, display_name, username').in('id', tutorIds)
      : Promise.resolve({ data: [] as ProfileNameRow[] }),
    subjectIds.length > 0
      ? admin.from('subjects').select('id, name, label').in('id', subjectIds)
      : Promise.resolve({ data: [] as SubjectRow[] }),
  ]);

  const tutorMap = new Map((tutors ?? []).map((row) => [row.id, row as ProfileNameRow]));
  const subjectMap = new Map((subjects ?? []).map((row) => [row.id, row as SubjectRow]));
  const bookingMap = new Map(bookingRows.map((row) => [row.id, row]));

  const classEntries = Array.from(
    new Map(
      bookingRows
        .filter(hasActiveClass)
        .map((booking) => [
          `${booking.subject_id}:${booking.tutor_id}`,
          {
            subjectName: subjectName(subjectMap.get(booking.subject_id)),
            tutorName: displayName(tutorMap.get(booking.tutor_id)),
          },
        ])
    ).values()
  );

  return {
    child: {
      id: normalizedChildProfile.id,
      color: childLink?.child_color || '#9333EA',
      fullName: normalizedChildProfile.full_name || 'Student',
      displayName: normalizedChildProfile.display_name || null,
      email: normalizedChildProfile.email || null,
      school: normalizedChildProfile.school || null,
      formLevel: normalizedChildProfile.form_level || null,
      subjectsOfStudy: normalizedChildProfile.subjects_of_study || [],
    },
    stats: {
      classes: classEntries.length,
      bookings: bookingRows.length,
      upcomingSessions: sessionRows.filter(isUpcomingSession).length,
    },
    classes: classEntries,
    bookings: bookingRows.slice(0, 8).map((booking) => ({
      id: booking.id,
      tutorName: displayName(tutorMap.get(booking.tutor_id)),
      subjectName: subjectName(subjectMap.get(booking.subject_id)),
      status: booking.status,
      requestedStartAt: booking.requested_start_at,
      confirmedStartAt: booking.confirmed_start_at,
      durationMinutes: booking.duration_minutes ?? 60,
      priceTtd: booking.price_ttd ?? 0,
    })),
    sessions: sessionRows.slice(0, 8).map((session) => {
      const booking = bookingMap.get(session.booking_id);
      return {
        id: session.id,
        bookingId: session.booking_id,
        tutorName: displayName(tutorMap.get(session.tutor_id)),
        subjectName: subjectName(booking ? subjectMap.get(booking.subject_id) : null),
        status: session.status,
        scheduledStartAt: session.scheduled_start_at,
        scheduledEndAt: session.scheduled_end_at,
        durationMinutes: session.duration_minutes,
      };
    }),
  };
}

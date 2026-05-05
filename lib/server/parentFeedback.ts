import { getServiceClient } from '@/lib/supabase/server';
import { ParentAccessError } from '@/lib/server/parentAccess';

type ChildLinkRow = {
  child_id: string;
  child_profile:
    | { id: string; full_name: string | null; display_name: string | null }
    | Array<{ id: string; full_name: string | null; display_name: string | null }>
    | null;
};

type TutorFeedbackDb = {
  id: string;
  session_id: string;
  student_id: string;
  tutor_id: string;
  feedback_text: string;
  created_at: string;
};

type RatingDb = {
  id: string;
  session_id: string;
  student_id: string;
  tutor_id: string;
  stars: number;
  comment: string | null;
  created_at: string;
};

type SessionMini = { id: string; booking_id: string; student_id: string; tutor_id: string };
type BookingMini = { id: string; subject_id: string };
type ProfileMini = { id: string; full_name: string | null; display_name: string | null; username: string | null };
type SubjectMini = { id: string; name: string | null; label: string | null };

function childNameFromLink(row: ChildLinkRow): string {
  const p = row.child_profile;
  const prof = Array.isArray(p) ? p[0] : p;
  if (!prof) return 'Student';
  return prof.display_name || prof.full_name || 'Student';
}

function displayName(profile?: ProfileMini | null): string {
  if (!profile) return 'Unknown';
  return profile.display_name || profile.full_name || profile.username || 'Unknown';
}

function subjectLabel(s?: SubjectMini | null): string {
  if (!s) return 'Tutoring Session';
  return s.label || s.name || 'Tutoring Session';
}

export type ParentTutorNoteItem = {
  id: string;
  childId: string;
  childName: string;
  tutorName: string;
  subjectName: string;
  feedbackText: string;
  createdAt: string;
};

export type ParentStudentReviewItem = {
  id: string;
  childId: string;
  childName: string;
  tutorName: string;
  subjectName: string;
  stars: number;
  comment: string | null;
  createdAt: string;
};

export async function getParentFeedbackPageData(parentId: string) {
  const admin = getServiceClient();

  const { data: childLinks, error: linkErr } = await admin
    .from('parent_child_links')
    .select(
      `child_id, child_profile:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)`
    )
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true });

  if (linkErr) {
    throw new ParentAccessError('Failed to load children', 500);
  }

  const links = (childLinks ?? []) as unknown as ChildLinkRow[];
  const childNameById = new Map(links.map((l) => [l.child_id, childNameFromLink(l)]));
  const childIds = links.map((l) => l.child_id);

  if (childIds.length === 0) {
    return {
      children: [] as { id: string; name: string }[],
      tutorNotes: [] as ParentTutorNoteItem[],
      studentReviews: [] as ParentStudentReviewItem[],
    };
  }

  const [tfRes, rtRes] = await Promise.all([
    admin
      .from('tutor_feedback')
      .select('id, session_id, student_id, tutor_id, feedback_text, created_at')
      .in('student_id', childIds)
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('ratings')
      .select('id, session_id, student_id, tutor_id, stars, comment, created_at')
      .in('student_id', childIds)
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  if (tfRes.error && !isMissingRelation(tfRes.error)) {
    throw new ParentAccessError(tfRes.error.message, 500);
  }
  if (rtRes.error && !isMissingRelation(rtRes.error)) {
    throw new ParentAccessError(rtRes.error.message, 500);
  }

  const tutorNotesRaw = (tfRes.data ?? []) as TutorFeedbackDb[];
  const reviewsRaw = (rtRes.data ?? []) as RatingDb[];

  const sessionIdSet = new Set<string>();
  for (const r of tutorNotesRaw) sessionIdSet.add(r.session_id);
  for (const r of reviewsRaw) sessionIdSet.add(r.session_id);
  const sessionIds = [...sessionIdSet];

  let sessions: SessionMini[] = [];
  if (sessionIds.length > 0) {
    const { data: sess, error: sErr } = await admin
      .from('sessions')
      .select('id, booking_id, student_id, tutor_id')
      .in('id', sessionIds);
    if (sErr && !isMissingRelation(sErr)) {
      throw new ParentAccessError(sErr.message, 500);
    }
    sessions = (sess ?? []) as SessionMini[];
  }

  const bookingIds = [...new Set(sessions.map((s) => s.booking_id))];
  let bookings: BookingMini[] = [];
  if (bookingIds.length > 0) {
    const { data: bk, error: bErr } = await admin
      .from('bookings')
      .select('id, subject_id')
      .in('id', bookingIds);
    if (bErr && !isMissingRelation(bErr)) {
      throw new ParentAccessError(bErr.message, 500);
    }
    bookings = (bk ?? []) as BookingMini[];
  }

  const tutorIdSet = new Set<string>();
  for (const r of tutorNotesRaw) tutorIdSet.add(r.tutor_id);
  for (const r of reviewsRaw) tutorIdSet.add(r.tutor_id);
  for (const s of sessions) tutorIdSet.add(s.tutor_id);
  const tutorIds = [...tutorIdSet];

  const subjectIds = [...new Set(bookings.map((b) => b.subject_id).filter(Boolean))];

  const [{ data: tutors }, { data: subjects }] = await Promise.all([
    tutorIds.length > 0
      ? admin.from('profiles').select('id, full_name, display_name, username').in('id', tutorIds)
      : Promise.resolve({ data: [] as ProfileMini[] }),
    subjectIds.length > 0
      ? admin.from('subjects').select('id, name, label').in('id', subjectIds)
      : Promise.resolve({ data: [] as SubjectMini[] }),
  ]);

  const tutorMap = new Map((tutors ?? []).map((t) => [t.id, t as ProfileMini]));
  const subjectMap = new Map((subjects ?? []).map((s) => [s.id, s as SubjectMini]));
  const bookingMap = new Map(bookings.map((b) => [b.id, b]));
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  function subjectForSession(sessionId: string): string {
    const session = sessionMap.get(sessionId);
    if (!session) return 'Tutoring Session';
    const booking = bookingMap.get(session.booking_id);
    return subjectLabel(booking ? subjectMap.get(booking.subject_id) : null);
  }

  const tutorNotes: ParentTutorNoteItem[] = tutorNotesRaw.map((row) => ({
    id: row.id,
    childId: row.student_id,
    childName: childNameById.get(row.student_id) ?? 'Student',
    tutorName: displayName(tutorMap.get(row.tutor_id)),
    subjectName: subjectForSession(row.session_id),
    feedbackText: row.feedback_text,
    createdAt: row.created_at,
  }));

  const studentReviews: ParentStudentReviewItem[] = reviewsRaw.map((row) => ({
    id: row.id,
    childId: row.student_id,
    childName: childNameById.get(row.student_id) ?? 'Student',
    tutorName: displayName(tutorMap.get(row.tutor_id)),
    subjectName: subjectForSession(row.session_id),
    stars: row.stars,
    comment: row.comment,
    createdAt: row.created_at,
  }));

  return {
    children: links.map((l) => ({
      id: l.child_id,
      name: childNameById.get(l.child_id) ?? 'Student',
    })),
    tutorNotes,
    studentReviews,
  };
}

function isMissingRelation(err: { code?: string; message?: string }): boolean {
  const code = String(err?.code ?? '');
  const msg = String(err?.message ?? '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || msg.includes('does not exist');
}

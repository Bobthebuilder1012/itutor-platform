// What students, parents and the public may see about a teacher's verification.
//
// THE RULE: nothing is returned for a teacher unless BOTH their v2 application
// and their profile are VERIFIED. A teacher who is in review, rejected, asked to
// reverify, or revoked looks exactly like a teacher who never applied.
//
// Columns are listed explicitly. Never returned: proof files or paths, a proof
// link, Stripe references, the identity result detail, attempts, reviewer
// reasons, email. The three labels are separate facts:
//   idChecked            the identity provider passed this teacher's ID check
//   credentialsReviewed  a reviewer approved the credentials
//   hasExtras            the teacher added extras (NOT verified by iTutor)

import type { Db } from '@/lib/verification/setStatus';

export interface PublicSummary {
  idChecked: boolean;
  credentialsReviewed: boolean;
  hasExtras: boolean;
}

export interface PublicCredential {
  kind: 'CSEC' | 'CAPE' | 'DEGREE';
  subject: string | null;
  grade: string | null;
  examYear: number | null;
  school: string | null;
  degree: string | null;
  field: string | null;
  graduationYear: number | null;
}

export interface PublicExtra {
  title: string;
  description: string;
  linkUrl: string | null;
}

export interface PublicDetail extends PublicSummary {
  verifiedAt: string | null;
  credentials: PublicCredential[];
  extras: PublicExtra[];
}

export const MAX_SUMMARY_IDS = 50;
const UUIDISH = /^[0-9a-zA-Z-]{1,64}$/;

/** Teachers who are verified in BOTH records, keyed by id. */
async function verifiedRows(db: Db, ids: string[]) {
  const [v2, profiles] = await Promise.all([
    db
      .from('tutor_verification_v2')
      .select('tutor_id, identity_status, decided_at')
      .in('tutor_id', ids)
      .eq('status', 'VERIFIED'),
    db.from('profiles').select('id').in('id', ids).eq('tutor_verification_status', 'VERIFIED'),
  ]);
  if (v2.error || profiles.error) throw new Error('verification lookup failed');
  const profileVerified = new Set((profiles.data ?? []).map((p: any) => p.id));
  return (v2.data ?? []).filter((r: any) => profileVerified.has(r.tutor_id));
}

export async function loadPublicSummaries(db: Db, rawIds: string[]): Promise<Record<string, PublicSummary>> {
  const ids = Array.from(new Set(rawIds.filter((i) => UUIDISH.test(i)))).slice(0, MAX_SUMMARY_IDS);
  const out: Record<string, PublicSummary> = {};
  if (ids.length === 0) return out;

  const rows = await verifiedRows(db, ids);
  if (rows.length === 0) return out;

  const verifiedIds = rows.map((r: any) => r.tutor_id);
  const { data: extras, error } = await db.from('tutor_extras_v2').select('tutor_id').in('tutor_id', verifiedIds);
  if (error) throw new Error('extras lookup failed');
  const withExtras = new Set((extras ?? []).map((e: any) => e.tutor_id));

  for (const r of rows) {
    out[r.tutor_id] = {
      idChecked: r.identity_status === 'verified',
      credentialsReviewed: true,
      hasExtras: withExtras.has(r.tutor_id),
    };
  }
  return out;
}

export async function loadPublicDetail(db: Db, tutorId: string): Promise<PublicDetail | null> {
  if (!UUIDISH.test(tutorId)) return null;
  const rows = await verifiedRows(db, [tutorId]);
  const row = rows[0];
  if (!row) return null;

  const [creds, extras] = await Promise.all([
    db
      .from('tutor_credentials_v2')
      .select('kind, subject, grade, exam_year, school, degree, field, graduation_year')
      .eq('tutor_id', tutorId)
      .order('created_at', { ascending: true }),
    db
      .from('tutor_extras_v2')
      .select('title, description, link_url')
      .eq('tutor_id', tutorId)
      .order('created_at', { ascending: true })
      .limit(3),
  ]);
  if (creds.error || extras.error) throw new Error('detail lookup failed');

  return {
    idChecked: row.identity_status === 'verified',
    credentialsReviewed: true,
    hasExtras: (extras.data ?? []).length > 0,
    verifiedAt: row.decided_at ?? null,
    credentials: (creds.data ?? []).map((c: any) => ({
      kind: c.kind,
      subject: c.subject,
      grade: c.grade,
      examYear: c.exam_year,
      school: c.school,
      degree: c.degree,
      field: c.field,
      graduationYear: c.graduation_year,
    })),
    extras: (extras.data ?? []).slice(0, 3).map((x: any) => ({
      title: x.title,
      description: x.description,
      linkUrl: x.link_url,
    })),
  };
}

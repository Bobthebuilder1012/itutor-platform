// What the public "Verification details" page shows: the APPROVED credentials of a teacher
// who is VERIFIED, with their proof files through short-lived signed links.
//
// Server only. It returns null (the page answers 404) for any teacher who is not verified, so
// an unverified or in-progress teacher produces the same response as one that does not exist:
// nothing is said about verification. It never reads or returns the ID check, the selfie,
// provider data, a rejection reason or an admin note: it does not even select them.

import { PROOF_BUCKET } from './constants';
import { loadPublicDetail } from './publicView';
import type { Db } from '@/lib/verification/setStatus';

/** How long a proof link works, in seconds. */
export const PROOF_LINK_SECONDS = 600;

export interface PublicCredentialWithProof {
  kind: 'CSEC' | 'CAPE' | 'DEGREE';
  subject: string | null;
  grade: string | null;
  examYear: number | null;
  school: string | null;
  degree: string | null;
  field: string | null;
  graduationYear: number | null;
  /** A short-lived link to the proof file, or null. */
  proofLink: string | null;
  proofType: 'image' | 'pdf' | null;
}

export interface VerificationDetailsPage {
  tutorId: string;
  name: string | null;
  verifiedAt: string | null;
  credentials: PublicCredentialWithProof[];
}

const proofType = (filename: string | null | undefined): 'image' | 'pdf' | null => {
  const f = (filename ?? '').toLowerCase();
  if (f.endsWith('.pdf')) return 'pdf';
  if (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')) return 'image';
  return null;
};

export async function loadVerificationDetailsPage(db: Db, tutorId: string): Promise<VerificationDetailsPage | null> {
  // null unless verified in BOTH records (the same rule as the badge).
  const base = await loadPublicDetail(db, tutorId);
  if (!base) return null;

  const [creds, profile] = await Promise.all([
    db
      .from('tutor_credentials_v2')
      .select('kind, subject, grade, exam_year, school, degree, field, graduation_year, proof_path, proof_filename, proof_deleted_at')
      .eq('tutor_id', tutorId)
      .eq('pending_approval', false)
      .order('created_at', { ascending: true }),
    db.from('profiles').select('full_name, display_name').eq('id', tutorId).maybeSingle(),
  ]);
  if (creds.error) throw new Error('credential lookup failed');

  const credentials = await Promise.all(
    (creds.data ?? []).map(async (c: any): Promise<PublicCredentialWithProof> => {
      let proofLink: string | null = null;
      if (c.proof_path && !c.proof_deleted_at) {
        const { data } = await db.storage.from(PROOF_BUCKET).createSignedUrl(c.proof_path, PROOF_LINK_SECONDS);
        proofLink = data?.signedUrl ?? null;
      }
      return {
        kind: c.kind,
        subject: c.subject,
        grade: c.grade,
        examYear: c.exam_year,
        school: c.school,
        degree: c.degree,
        field: c.field,
        graduationYear: c.graduation_year,
        proofLink,
        proofType: proofLink ? proofType(c.proof_filename ?? c.proof_path) : null,
      };
    })
  );

  const p = profile.data as { full_name?: string | null; display_name?: string | null } | null;
  return { tutorId, name: p?.display_name || p?.full_name || null, verifiedAt: base.verifiedAt, credentials };
}

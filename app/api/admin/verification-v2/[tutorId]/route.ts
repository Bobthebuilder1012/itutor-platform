// GET /api/admin/verification-v2/[tutorId]
// Everything a reviewer needs for one application: the teacher, the Stripe
// result (status only), credentials with short-lived links to their proof files,
// extras, the decision history, and the evidence criteria from config.
//
// What it never returns: an ID image, an ID number or anything from the Stripe
// check beyond pass/fail and a reason code. v2 holds none of it.

import { NextRequest, NextResponse } from 'next/server';
import { PROOF_BUCKET } from '@/lib/verificationV2/constants';
import { guardAdminV2 } from '@/lib/verificationV2/adminGuard';
import { schemaNotReady } from '@/lib/verificationV2/schemaReady';
import { evidenceFor } from '@/config/verificationEvidence';

export const dynamic = 'force-dynamic';

const PROOF_LINK_SECONDS = 600;

export async function GET(_req: NextRequest, { params }: { params: { tutorId: string } }) {
  const g = await guardAdminV2();
  if (g.error) return g.error;
  const tutorId = params.tutorId;

  const { data: row, error } = await g.db
    .from('tutor_verification_v2')
    .select(
      'tutor_id, status, consent_at, identity_status, identity_error_code, identity_provider, identity_provider_code, identity_country, identity_attempts, identity_verified_at, submitted_at, decision_reason, decided_at, identity_redacted_at, files_deleted_at'
    )
    .eq('tutor_id', tutorId)
    .maybeSingle();
  const setup = schemaNotReady(error);
  if (setup) return setup;
  if (error) {
    console.error('[admin/verification-v2/detail]', error.message);
    return NextResponse.json({ error: 'Could not load the application' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'No application found for this teacher' }, { status: 404 });

  const [profile, creds, extras, decisions] = await Promise.all([
    g.db
      .from('profiles')
      .select('id, full_name, display_name, email, tutor_verification_status')
      .eq('id', tutorId)
      .maybeSingle(),
    g.db
      .from('tutor_credentials_v2')
      .select(
        'id, kind, subject, grade, exam_year, school, degree, field, graduation_year, proof_url, proof_path, proof_filename, proof_deleted_at'
      )
      .eq('tutor_id', tutorId)
      .order('created_at', { ascending: true }),
    g.db
      .from('tutor_extras_v2')
      .select('id, title, description, link_url')
      .eq('tutor_id', tutorId)
      .order('created_at', { ascending: true }),
    g.db
      .from('tutor_verification_v2_decisions')
      .select('id, actor_role, action, from_status, to_status, profile_from_status, profile_to_status, reason, created_at')
      .eq('tutor_id', tutorId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const credentials = await Promise.all(
    (creds.data ?? []).map(async (c: any) => {
      let proofLink: string | null = null;
      if (c.proof_path) {
        const { data } = await g.db.storage.from(PROOF_BUCKET).createSignedUrl(c.proof_path, PROOF_LINK_SECONDS);
        proofLink = data?.signedUrl ?? null;
      }
      return {
        id: c.id,
        kind: c.kind,
        subject: c.subject,
        grade: c.grade,
        examYear: c.exam_year,
        school: c.school,
        degree: c.degree,
        field: c.field,
        graduationYear: c.graduation_year,
        proofUrl: c.proof_url,
        proofFilename: c.proof_filename,
        proofLink,
        proofDeleted: !!c.proof_deleted_at,
        evidence: evidenceFor(c.kind, c.subject ?? c.degree ?? c.field).map((r) => ({
          key: r.key,
          label: r.label,
          criteria: r.criteria,
        })),
      };
    })
  );

  return NextResponse.json({
    tutor: {
      id: tutorId,
      name: profile.data?.display_name || profile.data?.full_name || null,
      email: profile.data?.email ?? null,
      profileStatus: profile.data?.tutor_verification_status ?? null,
    },
    application: {
      status: row.status,
      consentAt: row.consent_at,
      identity: {
        status: row.identity_status,
        /** The neutral reason. */
        errorCode: row.identity_error_code,
        provider: row.identity_provider ?? null,
        /** The provider's raw code: admin-only, for coverage testing. */
        providerCode: row.identity_provider_code ?? null,
        country: row.identity_country ?? null,
        attempts: row.identity_attempts,
        verifiedAt: row.identity_verified_at,
        redacted: !!row.identity_redacted_at,
      },
      submittedAt: row.submitted_at,
      decisionReason: row.decision_reason,
      decidedAt: row.decided_at,
      filesDeleted: !!row.files_deleted_at,
    },
    credentials,
    extras: (extras.data ?? []).map((e: any) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      linkUrl: e.link_url,
    })),
    decisions: (decisions.data ?? []).map((d: any) => ({
      id: d.id,
      actorRole: d.actor_role,
      action: d.action,
      from: d.from_status,
      to: d.to_status,
      profileFrom: d.profile_from_status,
      profileTo: d.profile_to_status,
      reason: d.reason,
      at: d.created_at,
    })),
  });
}

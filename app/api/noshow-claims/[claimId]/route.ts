// =====================================================
// GET A NO-SHOW CLAIM
// =====================================================
// GET /api/noshow-claims/:claimId
//
// Returns the full claim payload + signed download URLs for any
// evidence files. Visible to claim participants and admins.
//
// Signed URLs are minted server-side rather than relying on storage
// RLS so we can let the defendant + admin see the claimant's files
// without granting cross-tenant storage permission.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EVIDENCE_URL_TTL_SECONDS = 60 * 30; // 30 min

interface EvidenceFile {
  path: string;
  original_name?: string;
  size?: number;
  type?: string;
}

async function signEvidence(
  admin: ReturnType<typeof getServiceClient>,
  files: EvidenceFile[] | null | undefined
) {
  if (!files || files.length === 0) return [];
  const out: Array<EvidenceFile & { signed_url: string | null }> = [];
  for (const f of files) {
    if (!f?.path) {
      out.push({ ...f, signed_url: null });
      continue;
    }
    const { data } = await admin.storage
      .from('noshow-evidence')
      .createSignedUrl(f.path, EVIDENCE_URL_TTL_SECONDS);
    out.push({ ...f, signed_url: data?.signedUrl ?? null });
  }
  return out;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { claimId: string } }
) {
  const serverClient = await getServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getServiceClient();

  const { data: claim, error } = await admin
    .from('noshow_claims')
    .select(
      'id, session_id, booking_id, claimant_id, claimant_role, defendant_id, evidence_type, evidence_files, written_explanation, defendant_response, defendant_evidence_files, defendant_responded_at, response_deadline, status, admin_verdict, admin_notes, admin_decided_at, created_at, updated_at'
    )
    .eq('id', params.claimId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claim) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = profile?.role === 'admin';
  const isParticipant = claim.claimant_id === user.id || claim.defendant_id === user.id;

  if (!isParticipant && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [claimant, defendant, session, signedClaimantFiles, signedDefendantFiles] =
    await Promise.all([
      admin
        .from('profiles')
        .select('id, full_name, display_name, username, avatar_url')
        .eq('id', claim.claimant_id)
        .maybeSingle()
        .then((r) => r.data),
      admin
        .from('profiles')
        .select('id, full_name, display_name, username, avatar_url')
        .eq('id', claim.defendant_id)
        .maybeSingle()
        .then((r) => r.data),
      admin
        .from('sessions')
        .select('id, scheduled_start_at, scheduled_end_at, status, charge_amount_ttd')
        .eq('id', claim.session_id)
        .maybeSingle()
        .then((r) => r.data),
      signEvidence(admin, claim.evidence_files as EvidenceFile[] | null),
      signEvidence(admin, claim.defendant_evidence_files as EvidenceFile[] | null),
    ]);

  return NextResponse.json({
    ...claim,
    evidence_files: signedClaimantFiles,
    defendant_evidence_files: signedDefendantFiles,
    claimant,
    defendant,
    session,
    viewer_role: isAdmin
      ? 'admin'
      : claim.claimant_id === user.id
        ? 'claimant'
        : 'defendant',
  });
}

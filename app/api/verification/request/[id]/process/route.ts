// =====================================================
// VERIFICATION PROCESSING API
// =====================================================
// Processes an uploaded document with OCR and generates a system recommendation.
//
// AUTH (was: none). One of a server secret, an admin/reviewer session, or the
// tutor who owns this exact request. See lib/verification/processAuth.ts.
// Every status change goes through lib/verification/setStatus.ts.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { ocrProvider } from '@/lib/ocr/ocrProvider';
import { decideProcessAccess, resolveProcessCaller } from '@/lib/verification/processAuth';
import {
  isRuleRefusal,
  setProfileStatus,
  setRequestStatus,
  statusErrorResponse,
} from '@/lib/verification/setStatus';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = params.id;

  // 1. Who is asking? Reject before touching the database.
  const caller = await resolveProcessCaller(request);
  if (!caller.secretMatched && !caller.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

  // 2. Load the request, then check this caller may process THIS request.
  const { data: verificationRequest, error: requestError } = await supabase
    .from('tutor_verification_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (requestError) {
    console.error('[verification/process] could not load request:', requestError.message);
    return NextResponse.json({ error: 'Could not load the request' }, { status: 500 });
  }
  if (!verificationRequest) {
    return NextResponse.json({ error: 'Verification request not found' }, { status: 404 });
  }

  const access = decideProcessAccess(caller, verificationRequest.tutor_id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (verificationRequest.status !== 'SUBMITTED') {
    return NextResponse.json(
      { error: `Request already in status: ${verificationRequest.status}` },
      { status: 400 }
    );
  }

  const tutorId: string = verificationRequest.tutor_id;

  try {
    // 3. SUBMITTED -> PROCESSING
    const started = await setRequestStatus({
      requestId,
      to: 'PROCESSING',
      actor: 'system',
      db: supabase,
    });
    if (!started.ok) return statusErrorResponse(started);

    // The teacher's profile moves to PROCESSING only when the map allows it. A
    // VERIFIED or REVOKED teacher's profile must not be dragged back, so a rule
    // refusal here is expected and skipped; any other failure is real.
    const profileStarted = await setProfileStatus({
      tutorId,
      to: 'PROCESSING',
      actor: 'system',
      db: supabase,
    });
    if (!profileStarted.ok && !isRuleRefusal(profileStarted)) {
      throw new Error(profileStarted.message);
    }

    await logEvent(supabase, requestId, 'OCR_STARTED', {
      file_path: verificationRequest.file_path,
      file_type: verificationRequest.file_type,
    });

    // 4. OCR
    const { data: tutorProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, display_name')
      .eq('id', tutorId)
      .single();
    if (profileError) throw new Error('Tutor profile not found');

    const ocrResult = await ocrProvider.processDocument(
      verificationRequest.file_path,
      verificationRequest.file_type
    );

    await logEvent(supabase, requestId, 'OCR_DONE', {
      confidence_score: ocrResult.confidenceScore,
      extracted_fields: ocrResult.extractedJson,
    });

    const recommendation = ocrProvider.generateRecommendation(ocrResult, tutorProfile);

    await logEvent(supabase, requestId, 'SYSTEM_RECOMMENDED', {
      recommendation: recommendation.recommendation,
      reason: recommendation.reason,
      confidence_score: ocrResult.confidenceScore,
    });

    // 5. PROCESSING -> READY_FOR_REVIEW with the OCR output.
    // Earlier pending requests from this tutor are deliberately left alone:
    // documents queue up and a reviewer decides each one on its own.
    const done = await setRequestStatus({
      requestId,
      to: 'READY_FOR_REVIEW',
      actor: 'system',
      fields: {
        extracted_text: ocrResult.extractedText,
        extracted_json: ocrResult.extractedJson,
        confidence_score: ocrResult.confidenceScore,
        system_recommendation: recommendation.recommendation,
        system_reason: recommendation.reason,
      },
      db: supabase,
    });
    if (!done.ok) throw new Error(done.message);

    // OCR text and extracted fields stay in the database. They are NOT returned.
    return NextResponse.json({
      success: true,
      requestId,
      status: 'READY_FOR_REVIEW',
    });
  } catch (error: any) {
    console.error('[verification/process] failed:', error?.message);

    // Put both records back so the upload can be retried instead of sitting in
    // PROCESSING forever. Failures here are logged, not swallowed.
    const reset = await setRequestStatus({
      requestId,
      to: 'SUBMITTED',
      actor: 'system',
      fields: { notes: { error: 'processing_failed', timestamp: new Date().toISOString() } },
      db: supabase,
    });
    if (!reset.ok) console.error('[verification/process] could not reset request:', reset.message);

    const resetProfile = await setProfileStatus({ tutorId, to: 'PENDING', actor: 'system', db: supabase });
    if (!resetProfile.ok && !isRuleRefusal(resetProfile)) {
      console.error('[verification/process] could not reset profile:', resetProfile.message);
    }

    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

async function logEvent(
  db: ReturnType<typeof getServiceClient>,
  requestId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  const { error } = await db
    .from('tutor_verification_events')
    .insert({ request_id: requestId, event_type: eventType, payload });
  if (error) console.error(`[verification/process] event ${eventType} not recorded:`, error.message);
}

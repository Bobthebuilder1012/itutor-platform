// =====================================================
// FILE A NO-SHOW CLAIM
// =====================================================
// POST /api/noshow-claims/file
// Body: {
//   sessionId: string,
//   evidenceType?: string,
//   evidenceFiles?: Array<{ path: string; original_name?: string; size?: number; type?: string }>,
//   writtenExplanation: string
// }
//
// Replaces the one-click MarkNoShowButton for students.
// Creates a noshow_claims row in 'awaiting_response' state with a
// 12-hour deadline for the tutor to respond. Refund + ratings do NOT
// fire here — they fire when the admin renders a verdict.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { NOSHOW_RESPONSE_WINDOW_HOURS, NOSHOW_CLAIM_FILING_WINDOW_HOURS } from '@/lib/reliability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Body {
  sessionId?: string;
  evidenceType?: string;
  evidenceFiles?: Array<{ path: string; original_name?: string; size?: number; type?: string }>;
  writtenExplanation?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;

    if (!body.sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    if (typeof body.writtenExplanation !== 'string' || body.writtenExplanation.trim().length < 20) {
      return NextResponse.json(
        { error: 'writtenExplanation must be at least 20 characters' },
        { status: 400 }
      );
    }

    const serverClient = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    const { data: session } = await admin
      .from('sessions')
      .select('id, booking_id, tutor_id, student_id, status, scheduled_start_at, scheduled_end_at')
      .eq('id', body.sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const claimantRole: 'student' | 'tutor' =
      session.student_id === user.id
        ? 'student'
        : session.tutor_id === user.id
          ? 'tutor'
          : (null as any);

    if (!claimantRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Status gate.
    if (!['SCHEDULED', 'JOIN_OPEN'].includes(session.status)) {
      return NextResponse.json(
        { error: `Session is in '${session.status}' state and cannot be disputed.` },
        { status: 409 }
      );
    }

    // 24-hour filing window from session start.
    const start = new Date(session.scheduled_start_at).getTime();
    const ageHours = (Date.now() - start) / 3_600_000;
    if (ageHours > NOSHOW_CLAIM_FILING_WINDOW_HOURS) {
      return NextResponse.json(
        { error: `Claims must be filed within ${NOSHOW_CLAIM_FILING_WINDOW_HOURS} hours of session start.` },
        { status: 400 }
      );
    }

    // Single claim per session (unique constraint also enforces this).
    const { data: existing } = await admin
      .from('noshow_claims')
      .select('id')
      .eq('session_id', session.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'A claim already exists for this session', claimId: existing.id },
        { status: 409 }
      );
    }

    const defendantId = claimantRole === 'student' ? session.tutor_id : session.student_id;
    const responseDeadline = new Date(
      Date.now() + NOSHOW_RESPONSE_WINDOW_HOURS * 3_600_000
    ).toISOString();

    const { data: inserted, error: insertError } = await admin
      .from('noshow_claims')
      .insert({
        session_id: session.id,
        booking_id: session.booking_id,
        claimant_id: user.id,
        claimant_role: claimantRole,
        defendant_id: defendantId,
        evidence_type: body.evidenceType ?? null,
        evidence_files: body.evidenceFiles ?? [],
        written_explanation: body.writtenExplanation.trim(),
        response_deadline: responseDeadline,
        status: 'awaiting_response',
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to file claim' },
        { status: 500 }
      );
    }

    // Notify the defendant.
    try {
      await admin.from('notifications').insert({
        user_id: defendantId,
        type: 'noshow_claim_filed',
        title: 'No-show claim filed against you',
        message: `A no-show claim has been filed for your session. You have ${NOSHOW_RESPONSE_WINDOW_HOURS} hours to respond with your account.`,
        link:
          claimantRole === 'student'
            ? `/tutor/disputes/${inserted.id}`
            : `/student/disputes/${inserted.id}`,
      });
    } catch (e) {
      console.error('noshow-claims/file: notification insert failed', e);
    }

    // Hold or pre-register the payout when a student files a claim.
    if (claimantRole === 'student') {
      try {
        const { data: ledgerRow } = await admin
          .from('payout_ledger')
          .select('id, status')
          .eq('session_id', session.id)
          .maybeSingle();

        if (!ledgerRow) {
          // Charge cron hasn't fired yet — create a pre-ledger payout_case so
          // fn_create_earning_on_charge creates the ledger in admin_hold and links them.
          await admin.from('payout_cases').insert({
            payout_ledger_id: null,
            session_id:       session.id,
            noshow_claim_id:  inserted.id,
            claimant_id:      user.id,
            tutor_id:         session.tutor_id,
            hold_reason:      'student_reported_tutor_no_show',
            status:           'open',
          });
        } else if (['owed', 'release_ready'].includes(ledgerRow.status)) {
          await (admin as any).rpc('place_payout_hold', {
            p_ledger_id:       ledgerRow.id,
            p_hold_reason:     'student_reported_tutor_no_show',
            p_noshow_claim_id: inserted.id,
            p_claimant_id:     user.id,
          });
        } else if (ledgerRow.status === 'admin_hold') {
          // Already held — attach the claim to the existing open case
          await admin
            .from('payout_cases')
            .update({
              noshow_claim_id: inserted.id,
              updated_at: new Date().toISOString(),
            })
            .eq('payout_ledger_id', ledgerRow.id)
            .in('status', ['open', 'under_review']);
        } else if (ledgerRow.status === 'released') {
          // Payout already released — open a post-payout recovery case
          await admin.from('payout_cases').insert({
            payout_ledger_id: ledgerRow.id,
            session_id:       session.id,
            noshow_claim_id:  inserted.id,
            claimant_id:      user.id,
            tutor_id:         session.tutor_id,
            hold_reason:      'student_reported_tutor_no_show',
            status:           'open',
            admin_notes:      'Post-payout recovery: payout was already released at claim time.',
          });
        }
        // reversed: payout already cancelled — no action needed
      } catch (e) {
        console.error('noshow-claims/file: payout hold failed (non-blocking)', e);
      }
    }

    return NextResponse.json({
      success: true,
      claim_id: inserted.id,
      status: 'awaiting_response',
      response_deadline: responseDeadline,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to file claim' },
      { status: 500 }
    );
  }
}

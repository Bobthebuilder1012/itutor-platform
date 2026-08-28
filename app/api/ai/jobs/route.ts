/**
 * Enqueue a generation job.
 *
 * This handler charges a credit and writes a QUEUED row. It does NOT call a
 * model — rule 1 holds here exactly as written. The work happens in
 * `processAiJobs`, reached either by the cron (production) or by the drain
 * endpoint (everywhere).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { spendForJob, getBalance, ensureMonthlyGrant } from '@/lib/services/aiCreditService';
import { isAiProviderConfigured } from '@/lib/ai/provider';
import type { AiJobType } from '@/lib/services/aiJobService';

export const dynamic = 'force-dynamic';

/** The three flows the hub can start. Marking enqueues elsewhere. */
const FLOW_TO_JOB: Record<string, AiJobType> = {
  lesson: 'LESSON_PLAN',
  sheet: 'STUDY_SHEET',
  quiz: 'QUIZ_GENERATE',
};

export async function POST(request: NextRequest) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Refuse early rather than queueing work that can never run. Without this a
  // tutor is charged, watches a spinner, and gets a failure minutes later.
  if (!isAiProviderConfigured()) {
    return NextResponse.json(
      { error: 'iTutor AI is not switched on in this environment yet.', code: 'PROVIDER_UNCONFIGURED' },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    flow?: string;
    answers?: Record<string, string>;
    conversationId?: string;
    idempotencyKey?: string;
  };

  const jobType = FLOW_TO_JOB[body.flow ?? ''];
  if (!jobType) {
    return NextResponse.json({ error: 'Unknown flow' }, { status: 400 });
  }
  if (!body.answers || typeof body.answers !== 'object') {
    return NextResponse.json({ error: 'No answers supplied' }, { status: 400 });
  }

  const service = getServiceClient();

  await ensureMonthlyGrant(user.id);
  if ((await getBalance(user.id)) < 1) {
    return NextResponse.json(
      { error: "You've used this month's generations.", code: 'NO_CREDIT' },
      { status: 402 }
    );
  }

  // A double-tap on Generate must not produce two jobs or two charges. The
  // partial unique index on (user_id, idempotency_key) enforces it; this select
  // just turns the collision into the original job rather than an error.
  if (body.idempotencyKey) {
    const { data: existing } = await service
      .from('ai_jobs')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('idempotency_key', body.idempotencyKey)
      .maybeSingle();

    if (existing) return NextResponse.json({ job: existing }, { status: 200 });
  }

  const { data: job, error } = await service
    .from('ai_jobs')
    .insert({
      user_id: user.id,
      job_type: jobType,
      status: 'QUEUED',
      idempotency_key: body.idempotencyKey ?? null,
      input_ref: {
        flow: body.flow,
        answers: body.answers,
        conversation_id: body.conversationId ?? null,
      },
    })
    .select('id, status')
    .single();

  if (error || !job) {
    console.error('[ai/jobs] enqueue failed:', error?.message);
    return NextResponse.json({ error: 'Could not start the job' }, { status: 500 });
  }

  // Charged after the row exists, so the spend can carry the job id and the
  // worker can refund against it.
  const charged = await spendForJob(user.id, job.id);
  if (!charged) {
    await service.from('ai_jobs').update({ status: 'CANCELLED', error: 'Insufficient credit' }).eq('id', job.id);
    return NextResponse.json(
      { error: "You've used this month's generations.", code: 'NO_CREDIT' },
      { status: 402 }
    );
  }

  return NextResponse.json({ job }, { status: 201 });
}

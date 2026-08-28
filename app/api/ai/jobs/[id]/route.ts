/**
 * Poll one job.
 *
 * The hub calls this on an interval while a generation is running. It returns
 * the output inline once the job succeeds — these artifacts are a few KB of
 * JSON, so a second round trip to storage would buy nothing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: job } = await getServiceClient()
    .from('ai_jobs')
    .select('id, status, job_type, output_ref, error, attempts, completed_at, user_id')
    .eq('id', params.id)
    .maybeSingle();

  // Same 404 for missing and not-yours: a distinguishable response would
  // confirm which job ids exist.
  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { user_id: _omit, ...safe } = job;
  return NextResponse.json({ job: safe });
}

/**
 * The AI job worker's trigger.
 *
 * Shape follows app/api/cron/process-charges/route.ts: bearer CRON_SECRET,
 * force-dynamic, thin route delegating to a service. All the work is in
 * lib/services/aiJobService.ts.
 *
 * This route is the only place in the codebase from which a model call can
 * reach a provider, which is what makes rule 1 checkable rather than aspirational.
 */
import { NextRequest, NextResponse } from 'next/server';
import { processAiJobs } from '@/lib/services/aiJobService';

// Registering the flow handlers is a side effect of this import. Without it the
// worker claims jobs and fails every one of them for want of a handler.
import '@/lib/ai/handlers';

export const dynamic = 'force-dynamic';

/**
 * Model calls are slow. The default function timeout would cut a batch off
 * mid-job, leaving it RUNNING for the stuck sweep to rescue a quarter of an
 * hour later — correct, but slow for the tutor watching a spinner.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const summary = await processAiJobs();

    return NextResponse.json(
      { success: true, ...summary, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error processing AI jobs:', error);
    return NextResponse.json({ error: 'Failed to process AI jobs' }, { status: 500 });
  }
}

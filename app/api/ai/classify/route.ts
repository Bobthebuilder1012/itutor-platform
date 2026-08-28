/**
 * Routes composer text to a flow.
 *
 * This is a model call inside a request handler, which rule 1 forbids. It rides
 * the same signed-off exception as the chat route, for the same reason: the
 * tutor is waiting on the answer. The mitigations are that the call is tiny
 * (one short sentence, temperature 0, a handful of tokens) and that failure
 * degrades to chat rather than erroring — see lib/ai/classify.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { classifyComposerText } from '@/lib/ai/classify';
import { isAiProviderConfigured } from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';

/** Long enough for a paragraph of intent, short enough to bound the cost. */
const MAX_INPUT = 2000;

export async function POST(request: NextRequest) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? '').trim().slice(0, MAX_INPUT);

  if (!text) return NextResponse.json({ error: 'Nothing to route' }, { status: 400 });

  // With no provider there is no classifier, but chat is still the right
  // destination — it will explain that AI is off rather than failing silently.
  if (!isAiProviderConfigured()) {
    return NextResponse.json({ flow: 'chat', confidence: 0, answers: {} });
  }

  return NextResponse.json(await classifyComposerText(text));
}

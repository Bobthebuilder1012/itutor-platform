/**
 * Conversational Q&A, streamed.
 *
 * ── The second signed-off exception to rule 1 ───────────────────────────────
 *
 * Rule 1 says no model call happens inside a request handler, and this route
 * breaks it deliberately. The reason is latency, not convenience: real
 * generation jobs against this model take 21-30 seconds. Behind a progress
 * checklist that is acceptable for "write me a quiz"; for a chat reply it is
 * not, and no amount of queueing makes a conversation feel like one.
 *
 * What the rule protects is partly preserved — the connection is held, but the
 * tutor sees words within a second rather than staring at a spinner, and
 * nothing is blocked behind it. Generation stays on the queue, untouched.
 *
 * ── Grounding ──────────────────────────────────────────────────────────────
 *
 * Answers are grounded in what this tutor has actually produced: their own
 * lesson plans, study sheets, quizzes and marking runs. The curriculum is wired
 * into the same context builder but returns nothing until the CXC ingest lands,
 * so the chat surface does not change when it does — the prompt simply starts
 * carrying syllabus text.
 *
 * The system prompt is explicit that the model must not invent syllabus claims,
 * because with an empty curriculum table it would otherwise fill the gap from
 * general knowledge and present it with the same confidence as a real citation.
 */
import { NextRequest } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  streamChat,
  isAiProviderConfigured,
  estimateCostCents,
  type ChatTurn,
} from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** How much of the back-and-forth to carry. Enough for context, bounded for cost. */
const HISTORY_TURNS = 20;

/** How many recent artifacts to summarise into the grounding block. */
const ARTIFACT_LIMIT = 8;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Build the grounding block from the tutor's own work.
 *
 * Titles and topics only, not whole artifacts — a lesson plan is several
 * thousand tokens and stuffing eight of them into every turn would cost more
 * than the answer is worth. The model gets enough to know what exists and to
 * answer "what did I set last week"; anything deeper is a follow-up.
 */
async function buildGrounding(userId: string): Promise<string> {
  const service = getServiceClient();

  const [{ data: jobs }, { data: topics }] = await Promise.all([
    service
      .from('ai_jobs')
      .select('job_type, output_ref, completed_at')
      .eq('user_id', userId)
      .eq('status', 'SUCCEEDED')
      .order('completed_at', { ascending: false })
      .limit(ARTIFACT_LIMIT),
    // Verified curriculum only — rule 3. Empty until the CXC ingest runs, which
    // is why this is wired now rather than added later.
    service
      .from('syllabus_topics')
      .select('title, objective')
      .not('verified_at', 'is', null)
      .limit(40),
  ]);

  const lines: string[] = [];

  if (jobs?.length) {
    lines.push("This tutor's recent work in iTutor:");
    for (const job of jobs) {
      const output = (job.output_ref ?? {}) as { title?: string };
      const when = job.completed_at ? String(job.completed_at).slice(0, 10) : 'recently';
      lines.push(`- ${job.job_type} "${output.title ?? 'untitled'}" (${when})`);
    }
  } else {
    lines.push('This tutor has not generated anything in iTutor yet.');
  }

  if (topics?.length) {
    lines.push('', 'Verified syllabus topics you may cite:');
    for (const topic of topics) {
      lines.push(`- ${topic.title}${topic.objective ? `: ${topic.objective}` : ''}`);
    }
  } else {
    lines.push(
      '',
      'NO verified syllabus is loaded. You therefore cannot cite the syllabus.',
      'If asked what the syllabus says, say plainly that it has not been loaded',
      'yet and answer from general knowledge with that caveat stated. Never',
      'present general knowledge as a syllabus citation.'
    );
  }

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError('Unauthorized', 401);
  if (!isAiProviderConfigured()) {
    return jsonError('iTutor AI is not switched on in this environment yet.', 503);
  }

  const body = (await request.json().catch(() => ({}))) as {
    conversationId?: string;
    message?: string;
  };

  const message = (body.message ?? '').trim();
  if (!message) return jsonError('Nothing to send', 400);
  if (!body.conversationId) return jsonError('No conversation', 400);

  const service = getServiceClient();

  // Ownership is checked explicitly because this route uses the service client,
  // which bypasses RLS.
  const { data: conversation } = await service
    .from('ai_conversations')
    .select('id, user_id, title')
    .eq('id', body.conversationId)
    .maybeSingle();

  if (!conversation || conversation.user_id !== user.id) {
    return jsonError('Not found', 404);
  }

  const { data: priorRows } = await service
    .from('ai_messages')
    .select('role, content')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
    .limit(HISTORY_TURNS);

  // Persist the user's turn before generating, so a failure mid-stream leaves
  // the question in the transcript rather than losing it.
  await service.from('ai_messages').insert({
    conversation_id: conversation.id,
    role: 'user',
    content: message,
  });

  const history: ChatTurn[] = [
    ...(priorRows ?? [])
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({ role: row.role as 'user' | 'assistant', content: row.content })),
    { role: 'user', content: message },
  ];

  const grounding = await buildGrounding(user.id);

  const system = `You are iTutor AI, helping a Caribbean tutor who teaches CXC (CSEC and CAPE)
subjects in Trinidad & Tobago and the wider Caribbean.

Answer like a knowledgeable colleague: plainly, briefly, and concretely. Use
Caribbean contexts, names and currency (TTD, JMD, BBD) in any example you
invent. Use metric units.

You may be asked to change something you already made — "make it harder",
"focus on bearings instead". Say what you would change and offer to regenerate;
you cannot edit an artifact from this conversation directly.

Never invent a mark, a grade, or a student's result. If you do not know
something about this tutor's students, say so.

${grounding}`;

  let result;
  try {
    result = await streamChat(history, { system, temperature: 0.6 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Chat failed';
    return jsonError(detail, 502);
  }

  const encoder = new TextEncoder();
  let assembled = '';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const fragment of result.stream) {
          assembled += fragment;
          controller.enqueue(encoder.encode(fragment));
        }
      } catch (error) {
        // Surface the break in-band; the client is already rendering text and
        // a silent truncation would read as a complete answer.
        controller.enqueue(encoder.encode('\n\n[The reply was cut short.]'));
        console.error('[ai/chat] stream broke:', error);
      } finally {
        controller.close();

        // Chat is not charged a credit — a conversation that costs a
        // generation per reply would make tutors ration their questions, which
        // is the opposite of what this surface is for. But it does cost money,
        // and an unmeasured cost becomes an unpleasant surprise on a bill, so
        // the usage is recorded as a completed CHAT job. Rule 2 is about
        // metering being honest, not about charging for everything.
        try {
          const usage = await result.usage();
          await service.from('ai_jobs').insert({
            user_id: user.id,
            job_type: 'CHAT',
            status: 'SUCCEEDED',
            model: usage.model,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cost_cents: estimateCostCents(usage.inputTokens, usage.outputTokens),
            input_ref: { conversation_id: conversation.id },
            completed_at: new Date().toISOString(),
          });
        } catch (error) {
          // Never let bookkeeping lose the tutor their answer.
          console.error('[ai/chat] usage not recorded:', error);
        }

        if (assembled.trim()) {
          await service.from('ai_messages').insert({
            conversation_id: conversation.id,
            role: 'assistant',
            content: assembled,
          });

          // Auto-title from the first exchange. A conversation called "New
          // conversation" forever is the failure the history panel was
          // explicitly built to avoid.
          if (!conversation.title || conversation.title === 'New conversation') {
            const title = message.replace(/\s+/g, ' ').trim().slice(0, 60);
            await service
              .from('ai_conversations')
              .update({ title: title || 'Conversation' })
              .eq('id', conversation.id);
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      // Streaming through a proxy that buffers would defeat the whole point.
      'X-Accel-Buffering': 'no',
    },
  });
}

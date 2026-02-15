import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';

type Body = {
  sessionId?: string;
  feedbackText?: string;
};

function getAuthedSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

async function getOrCreateConversationIdAdmin(
  admin: ReturnType<typeof getServiceClient>,
  tutorId: string,
  studentId: string
): Promise<string> {
  const { data: existing } = await admin
    .from('conversations')
    .select('id, participant_1_id, participant_2_id')
    .or(
      `and(participant_1_id.eq.${tutorId},participant_2_id.eq.${studentId}),and(participant_1_id.eq.${studentId},participant_2_id.eq.${tutorId})`
    )
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const p1 = tutorId < studentId ? tutorId : studentId;
  const p2 = tutorId < studentId ? studentId : tutorId;

  const { data: created, error: createError } = await admin
    .from('conversations')
    .insert({ participant_1_id: p1, participant_2_id: p2 })
    .select('id')
    .single();

  // If a race created it, re-fetch.
  if (createError && createError.code === '23505') {
    const { data: retry } = await admin
      .from('conversations')
      .select('id')
      .or(
        `and(participant_1_id.eq.${tutorId},participant_2_id.eq.${studentId}),and(participant_1_id.eq.${studentId},participant_2_id.eq.${tutorId})`
      )
      .limit(1)
      .maybeSingle();
    if (retry?.id) return retry.id;
  }

  if (createError) throw createError;
  return created.id;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAuthedSupabase();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const sessionId = body.sessionId;
    const feedbackText = (body.feedbackText || '').trim();

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!feedbackText) {
      return NextResponse.json({ error: 'Feedback text is required' }, { status: 400 });
    }

    // Use service role for DB writes to avoid RLS recursion issues.
    const admin = getServiceClient();

    const { data: profile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'tutor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const nowIso = new Date().toISOString();

    const { data: session } = await admin
      .from('sessions')
      .select('id, tutor_id, student_id, scheduled_start_at, scheduled_end_at, status')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not eligible for feedback' }, { status: 400 });
    }

    if (session.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (session.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Session not eligible for feedback' }, { status: 400 });
    }
    if (new Date(session.scheduled_end_at).toISOString() > nowIso) {
      return NextResponse.json({ error: 'Session not eligible for feedback' }, { status: 400 });
    }

    const { error: insertError } = await admin.from('tutor_feedback').insert({
      session_id: sessionId,
      tutor_id: user.id,
      student_id: session.student_id,
      feedback_text: feedbackText,
    });

    if (insertError) {
      // If already submitted, treat as success (unlocking is based on existence).
      if (insertError.code === '23505') {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    const conversationId = await getOrCreateConversationIdAdmin(admin, user.id, session.student_id);
    console.log('✅ Conversation ID:', conversationId);

    // Format the message to look like a natural message from the tutor
    const message = feedbackText;

    const { data: insertedMessage, error: messageError } = await admin.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: message,
    }).select('id, conversation_id, sender_id, content, created_at').single();

    if (messageError) {
      console.error('❌ Message insert error:', messageError);
      return NextResponse.json({ error: messageError.message }, { status: 400 });
    }

    console.log('✅ Message inserted:', insertedMessage);

    // Verify the conversation was updated
    const { data: conversation } = await admin
      .from('conversations')
      .select('last_message_at, last_message_preview')
      .eq('id', conversationId)
      .single();
    
    console.log('✅ Conversation updated:', conversation);

    return NextResponse.json({ 
      ok: true, 
      messageId: insertedMessage.id,
      conversationId: conversationId 
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}


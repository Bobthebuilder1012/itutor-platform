import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; postId: string }> };

export const dynamic = 'force-dynamic';

async function resolveAccess(groupId: string, userId: string) {
  const service = getServiceClient();
  const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
  if (!group) return { error: 'Group not found', status: 404 as const };
  const isTutor = group.tutor_id === userId;
  if (!isTutor) {
    const { data: membership } = await service
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();
    if (!membership || membership.status !== 'approved') {
      return { error: 'Forbidden', status: 403 as const };
    }
  }
  return { service, isTutor };
}

// GET — tutor gets all student submissions; student gets own submission
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId, postId } = await params;
    const access = await resolveAccess(groupId, user.id);
    if ('status' in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const { service, isTutor } = access;

    if (isTutor) {
      const { data: members } = await service
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('status', 'approved');

      const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);

      const { data: profiles } = memberIds.length > 0
        ? await service.from('profiles').select('id, full_name, avatar_url').in('id', memberIds)
        : { data: [] };

      const { data: subs } = memberIds.length > 0
        ? await service
            .from('lesson_submissions')
            .select('student_id, file_url, file_name, files, feedback, status, score, score_total, result, submitted_at')
            .eq('post_id', postId)
            .in('student_id', memberIds)
        : { data: [] };

      const subsMap = new Map((subs ?? []).map((s: { student_id: string }) => [s.student_id, s]));

      const submissions = (profiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { student_id: _sid, ...subData } = subsMap.get(p.id) ?? { file_url: null, file_name: null, files: null, feedback: null, status: null, score: null, score_total: null, result: null, submitted_at: null };
        return {
          student_id: p.id,
          student_name: p.full_name ?? 'Unknown',
          student_avatar: p.avatar_url,
          ...subData,
        };
      });

      return NextResponse.json({ submissions, enrolled_count: memberIds.length });
    } else {
      const { data: sub } = await service
        .from('lesson_submissions')
        .select('id, file_url, file_name, files, status, score, score_total, result, feedback, submitted_at')
        .eq('post_id', postId)
        .eq('student_id', user.id)
        .maybeSingle();

      return NextResponse.json({ my_submission: sub ?? null });
    }
  } catch (err) {
    console.error('[GET submissions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — student submits (files pre-uploaded to storage client-side; send JSON metadata)
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId, postId } = await params;
    const access = await resolveAccess(groupId, user.id);
    if ('status' in access) return NextResponse.json({ error: access.error }, { status: access.status });
    if ((access as { isTutor: boolean }).isTutor) {
      return NextResponse.json({ error: 'Tutors cannot submit papers' }, { status: 403 });
    }

    const service = (access as { service: ReturnType<typeof getServiceClient> }).service;
    const body = await req.json() as {
      file_url: string;
      file_name: string;
      files?: { url: string; name: string; size: number }[];
    };

    if (!body.file_url || !body.file_name) {
      return NextResponse.json({ error: 'file_url and file_name are required' }, { status: 400 });
    }

    const { data: sub, error: dbError } = await service
      .from('lesson_submissions')
      .upsert({
        lesson_id: groupId,
        group_id: groupId,
        post_id: postId,
        student_id: user.id,
        file_url: body.file_url,
        file_name: body.file_name,
        files: body.files ?? null,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'post_id,student_id' })
      .select()
      .single();

    if (dbError) {
      console.error('[POST submissions] db error:', dbError);
      return NextResponse.json({ error: `Could not save submission: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({ submission: sub }, { status: 201 });
  } catch (err) {
    console.error('[POST submissions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — student unsubmits their submission
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId, postId } = await params;
    const access = await resolveAccess(groupId, user.id);
    if ('status' in access) return NextResponse.json({ error: access.error }, { status: access.status });
    if ((access as { isTutor: boolean }).isTutor) {
      return NextResponse.json({ error: 'Tutors cannot unsubmit student papers' }, { status: 403 });
    }

    const service = (access as { service: ReturnType<typeof getServiceClient> }).service;

    const { error } = await service
      .from('lesson_submissions')
      .delete()
      .eq('post_id', postId)
      .eq('student_id', user.id);

    if (error) {
      console.error('[DELETE submissions]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE submissions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH — tutor writes grades back after AI grading
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId, postId } = await params;
    const access = await resolveAccess(groupId, user.id);
    if ('status' in access) return NextResponse.json({ error: access.error }, { status: access.status });
    if (!(access as { isTutor: boolean }).isTutor) {
      return NextResponse.json({ error: 'Only tutors can write grades' }, { status: 403 });
    }

    const service = (access as { service: ReturnType<typeof getServiceClient> }).service;
    const body = await req.json() as {
      grades: { student_id: string; score: number; score_total: number; result: 'pass' | 'fail'; feedback: unknown }[];
      student_count: number;
    };

    for (const grade of body.grades) {
      await service
        .from('lesson_submissions')
        .update({
          status: 'graded',
          score: grade.score,
          score_total: grade.score_total,
          result: grade.result,
          feedback: grade.feedback,
        })
        .eq('post_id', postId)
        .eq('student_id', grade.student_id);
    }

    await service.from('ai_grading_runs').insert({
      group_id: groupId,
      post_id: postId,
      tutor_id: user.id,
      student_count: body.student_count,
      tokens_used: null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH submissions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

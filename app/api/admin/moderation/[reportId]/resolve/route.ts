import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId, requireAdmin } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';

const ACTION_TO_STATUS: Record<string, string> = {
  hide: 'resolved_hidden',
  delete: 'resolved_deleted',
  warn: 'resolved_warned',
  dismiss: 'dismissed',
};

export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const isAdmin = await requireAdmin(userId);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.action || !ACTION_TO_STATUS[body.action]) {
    return NextResponse.json(
      { error: 'action must be one of: hide, delete, warn, dismiss' },
      { status: 400 }
    );
  }

  const db = getServiceClient();

  const { data: report } = await db
    .from('comment_reports')
    .select('id, target_type, target_id, reply_id, status')
    .eq('id', params.reportId)
    .single();

  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (report.status !== 'pending') {
    return NextResponse.json({ error: 'Report already resolved' }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Apply action to content
  if (body.action === 'hide') {
    const table = report.reply_id
      ? null
      : report.target_type === 'class_comment'
        ? 'class_comments'
        : 'tutor_profile_comments';

    if (report.reply_id) {
      await db
        .from('comment_replies')
        .update({ deleted_at: now })
        .eq('id', report.reply_id);
    } else if (table) {
      await db
        .from(table as 'class_comments' | 'tutor_profile_comments')
        .update({ hidden_at: now, hidden_by: userId })
        .eq('id', report.target_id);
    }
  } else if (body.action === 'delete') {
    const table =
      report.target_type === 'class_comment' ? 'class_comments' : 'tutor_profile_comments';
    await db
      .from(table as 'class_comments' | 'tutor_profile_comments')
      .update({ deleted_at: now })
      .eq('id', report.target_id);
  }

  const { data, error } = await db
    .from('comment_reports')
    .update({
      status: ACTION_TO_STATUS[body.action],
      resolved_by: userId,
      resolved_at: now,
      resolution_note: body.note ?? null,
    })
    .eq('id', params.reportId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

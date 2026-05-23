import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const db = getServiceClient();

  const { data: existing } = await db
    .from('comment_replies')
    .select('author_id, deleted_at')
    .eq('id', params.id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.author_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (existing.deleted_at) return NextResponse.json({ error: 'Reply is deleted' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body?.body) return NextResponse.json({ error: 'body is required' }, { status: 400 });
  if (typeof body.body !== 'string' || body.body.length < 1 || body.body.length > 1000) {
    return NextResponse.json({ error: 'body must be 1–1000 characters' }, { status: 400 });
  }

  const { data, error } = await db
    .from('comment_replies')
    .update({ body: body.body, edited_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const db = getServiceClient();

  const { data: existing } = await db
    .from('comment_replies')
    .select('author_id, deleted_at')
    .eq('id', params.id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.author_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (existing.deleted_at) return NextResponse.json({ error: 'Already deleted' }, { status: 400 });

  const { error } = await db
    .from('comment_replies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

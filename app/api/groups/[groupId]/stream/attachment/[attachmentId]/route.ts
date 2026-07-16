import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor } from '@/lib/auth/groupAccess';
import { extractStoragePath } from '@/lib/utils/signedAttachmentUrl';

type Params = { params: Promise<{ groupId: string; attachmentId: string }> };

const ATTACHMENTS_BUCKET = 'message-attachments';

export const dynamic = 'force-dynamic';

// GET /api/groups/[groupId]/stream/attachment/[attachmentId]
// Same-origin proxy for a group-stream attachment. Streams the file from
// storage AFTER verifying the requester is the tutor or an approved member,
// and that the attachment actually belongs to this group. Keeps the Supabase
// URL hidden and re-checks access on every open (unlike a shareable signed
// URL).
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { groupId, attachmentId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Access: tutor or approved/active member of this group.
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    const isTutor = actor.actingAsTutor;
    if (!isTutor) {
      const { data: membership } = await service
        .from('group_members')
        .select('status')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!membership || !['approved', 'active'].includes(membership.status)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Resolve the attachment and confirm it belongs to a post in THIS group,
    // so a member of one group can't fetch another group's file by id.
    const { data: attachment } = await service
      .from('stream_attachments')
      .select('id, post_id, file_name, file_url, file_type')
      .eq('id', attachmentId)
      .maybeSingle();
    if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: post } = await service
      .from('stream_posts')
      .select('group_id')
      .eq('id', (attachment as any).post_id)
      .maybeSingle();
    if (!post || (post as any).group_id !== groupId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const path = extractStoragePath(ATTACHMENTS_BUCKET, (attachment as any).file_url);
    if (!path) return NextResponse.json({ error: 'File unavailable' }, { status: 404 });

    const { data: blob, error: dlError } = await service.storage.from(ATTACHMENTS_BUCKET).download(path);
    if (dlError || !blob) {
      console.error('[stream attachment proxy] download failed', dlError);
      return NextResponse.json({ error: 'File unavailable' }, { status: 404 });
    }

    const fileName = (attachment as any).file_name ?? path.split('/').pop() ?? 'attachment';
    const contentType = (attachment as any).file_type || blob.type || 'application/octet-stream';
    // RFC 5987 filename* for unicode safety; ASCII fallback for older clients.
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    const disposition = `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    return new NextResponse(blob.stream(), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        // Private (per-user auth) — do not let shared/CDN caches store it.
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (err) {
    console.error('[GET stream attachment proxy]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

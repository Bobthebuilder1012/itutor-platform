import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { classSettingsSchema } from '@/lib/validation/classSettings';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: classId } = await params;
    const supabase = await getServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // Verify ownership + not archived
    const { data: existing, error: existingError } = await supabase
      .from('groups')
      .select('tutor_id, archived_at, whatsapp_link, google_classroom_link, feedback_mode, parent_feedback_price, primary_channel, meeting_link')
      .eq('id', classId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    if (existing.tutor_id !== user.id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    if (existing.archived_at) return NextResponse.json({ ok: false, error: 'class_archived' }, { status: 410 });

    // Validate body
    const body = await req.json().catch(() => ({}));
    const parsed = classSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'validation_failed', details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Resolve the final values after this update (for cross-field validation)
    const resolvedWhatsapp = input.whatsapp_url !== undefined ? (input.whatsapp_url || '') : (existing.whatsapp_link || '');
    const resolvedClassroom = input.google_classroom_link !== undefined ? (input.google_classroom_link || '') : (existing.google_classroom_link || '');
    const resolvedChannel = input.primary_channel ?? existing.primary_channel ?? 'native';
    const resolvedFeedbackMode = input.parent_feedback_mode ?? existing.feedback_mode ?? 'off';
    const resolvedFeedbackPrice = input.parent_feedback_price !== undefined ? input.parent_feedback_price : (existing.parent_feedback_price ?? 0);

    if (resolvedChannel === 'whatsapp' && !resolvedWhatsapp) {
      return NextResponse.json({ ok: false, error: 'validation_failed', details: [{ field: 'whatsapp_url', message: 'WhatsApp URL is required when primary channel is WhatsApp.' }] }, { status: 400 });
    }
    if (resolvedChannel === 'classroom' && !resolvedClassroom) {
      return NextResponse.json({ ok: false, error: 'validation_failed', details: [{ field: 'google_classroom_link', message: 'Google Classroom link is required when primary channel is Classroom.' }] }, { status: 400 });
    }
    if (resolvedFeedbackMode === 'paid_addon' && (!resolvedFeedbackPrice || resolvedFeedbackPrice <= 0)) {
      return NextResponse.json({ ok: false, error: 'validation_failed', details: [{ field: 'parent_feedback_price', message: 'A price greater than 0 is required for paid add-on feedback.' }] }, { status: 400 });
    }

    // Build update payload (only fields that were sent)
    const updates: Record<string, unknown> = {};
    if (input.visibility !== undefined) updates.visibility = input.visibility;

    // Interlock: private classes always require join requests
    const resolvedVisibility = input.visibility ?? (existing as any).visibility ?? 'public';
    if (resolvedVisibility === 'private') {
      updates.require_join_requests = true;
    } else if (input.require_join_requests !== undefined) {
      updates.require_join_requests = input.require_join_requests;
    }
    if (input.auto_suspend_missed_payment !== undefined) updates.auto_suspend_missed_payment = input.auto_suspend_missed_payment;
    if (input.grace_period_days !== undefined) updates.grace_period_days = input.grace_period_days;
    if (input.whatsapp_url !== undefined) updates.whatsapp_link = input.whatsapp_url || null;
    if (input.google_classroom_link !== undefined) updates.google_classroom_link = input.google_classroom_link || null;
    if (input.primary_channel !== undefined) updates.primary_channel = input.primary_channel;
    if (input.parent_feedback_mode !== undefined) updates.feedback_mode = input.parent_feedback_mode;
    if (input.parent_feedback_price !== undefined) updates.parent_feedback_price = input.parent_feedback_price;
    if (input.meeting_link !== undefined) updates.meeting_link = input.meeting_link || null;

    const { data: updated, error: updateError } = await supabase
      .from('groups')
      .update(updates)
      .eq('id', classId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Side effects: parent feedback mode transitions
    const prevMode = existing.feedback_mode ?? 'off';
    const newMode = resolvedFeedbackMode;

    if (prevMode === 'off' && newMode !== 'off') {
      // Enabling feedback: upsert feedback settings row
      await supabase
        .from('group_feedback_settings')
        .upsert({ group_id: classId, enabled: true }, { onConflict: 'group_id' })
        .select();
    } else if (prevMode !== 'off' && newMode === 'off') {
      // Disabling feedback: close active periods + disable settings
      await supabase
        .from('group_feedback_periods')
        .update({ period_end: new Date().toISOString() })
        .eq('group_id', classId)
        .is('period_end', null);
      await supabase
        .from('group_feedback_settings')
        .update({ enabled: false })
        .eq('group_id', classId);
    }

    return NextResponse.json({ ok: true, class: updated });
  } catch (err) {
    console.error('[PATCH /api/classes/[id]/settings]', err);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';
import { classSettingsSchema } from '@/lib/validation/classSettings';
import { canOpenPreorders } from '@/lib/services/secureSpotService';
import { readClassLinkState } from '@/lib/classes/classLinkState';
import { normalizeClassLinkUrl } from '@/lib/utils/meetingLink';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' || code === 'PGRST204' ||
    msg.includes('does not exist') || msg.includes('could not find')
  );
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: classId } = await params;
    const supabase = await getServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // Verify ownership (or superadmin acting as tutor) + not archived. Use the
    // service client for the read AND all writes below: this route otherwise
    // reads/writes `groups` via the RLS client, which would silently deny an
    // admin override (groups UPDATE is tutor-only under RLS).
    //
    // The class link is NOT read here. meeting_link_mode arrives in migration
    // 262, and resolveGroupActor turns a select error into notFound — adding it
    // to this columns string would 404 every settings save on a database
    // without 262. readClassLinkState below reads it tolerantly instead.
    const service = getServiceClient();
    const actor = await resolveGroupActor({
      groupId: classId,
      userId: user.id,
      email: user.email,
      columns: 'whatsapp_link, google_classroom_link, feedback_mode, parent_feedback_price, primary_channel, visibility, secure_spot_enabled',
    });
    if (actor.notFound) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    if (!actor.authorized) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const existing = actor.group;
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

    // Each cross-field rule runs only when the body touches one of ITS fields.
    // The scheduling pop-up saves the class link on its own through this route,
    // and a class that already breaks a rule — primary channel WhatsApp with
    // the link since removed, paid feedback left at price 0 — would otherwise
    // refuse that save with an error about a setting the tutor never touched.
    // A save that does touch the channel or the feedback fields is checked
    // against the resolved values exactly as before.
    const touchesChannel = input.primary_channel !== undefined;
    if (
      (touchesChannel || input.whatsapp_url !== undefined) &&
      resolvedChannel === 'whatsapp' && !resolvedWhatsapp
    ) {
      return NextResponse.json({ ok: false, error: 'validation_failed', details: [{ field: 'whatsapp_url', message: 'WhatsApp URL is required when primary channel is WhatsApp.' }] }, { status: 400 });
    }
    if (
      (touchesChannel || input.google_classroom_link !== undefined) &&
      resolvedChannel === 'classroom' && !resolvedClassroom
    ) {
      return NextResponse.json({ ok: false, error: 'validation_failed', details: [{ field: 'google_classroom_link', message: 'Google Classroom link is required when primary channel is Classroom.' }] }, { status: 400 });
    }
    if (
      (input.parent_feedback_mode !== undefined || input.parent_feedback_price !== undefined) &&
      resolvedFeedbackMode === 'paid_addon' && (!resolvedFeedbackPrice || resolvedFeedbackPrice <= 0)
    ) {
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
    // Opening preorders lets the class take money before it has taught
    // anything, so eligibility is re-checked here rather than trusted from the
    // form. Turning it OFF is always allowed.
    // Only re-check when preorders are actually being OPENED. This form resends
    // every field on every save, so re-validating an unchanged `true` made the
    // whole request 400 with a bare "already_started" the moment the class
    // began — which is what stopped tutors editing capacity on a live class.
    if (input.secure_spot_enabled !== undefined) {
      const alreadyOpen = (existing as any).secure_spot_enabled === true;
      if (input.secure_spot_enabled === true && !alreadyOpen) {
        const allowed = await canOpenPreorders(service as any, classId);
        if (!allowed.ok) {
          return NextResponse.json(
            { ok: false, error: allowed.reason, message: allowed.message },
            { status: 400 }
          );
        }
      }
      updates.secure_spot_enabled = input.secure_spot_enabled;
    }
    if (input.grace_period_days !== undefined) updates.grace_period_days = input.grace_period_days;
    if (input.whatsapp_url !== undefined) updates.whatsapp_link = input.whatsapp_url || null;
    if (input.google_classroom_link !== undefined) updates.google_classroom_link = input.google_classroom_link || null;
    if (input.primary_channel !== undefined) updates.primary_channel = input.primary_channel;
    if (input.parent_feedback_mode !== undefined) updates.feedback_mode = input.parent_feedback_mode;
    if (input.parent_feedback_price !== undefined) updates.parent_feedback_price = input.parent_feedback_price;
    if (input.price_monthly !== undefined) updates.price_monthly = input.price_monthly;
    if (input.pricing_model !== undefined) updates.pricing_model = input.pricing_model;
    if (input.member_service_fee !== undefined) updates.member_service_fee = input.member_service_fee;

    // ── The class link ───────────────────────────────────────────────────────
    //
    // meeting_link is honoured ONLY when meeting_link_mode is in the same body.
    // It used to be written whenever it was sent, and the Settings form sent
    // `draft.meetingLink || null` on every save — so any settings save, from
    // any tab left open, wiped the Meet link the tutor's last Join had minted
    // (and would now wipe a tutor's own link). Tying it to the mode makes the
    // link a deliberate, separate save for every client, stale tabs included.
    //
    //   -> custom                 the tutor's own link, normalised. Resending
    //                             just the mode keeps the stored custom link.
    //   custom -> generated       clear the link, so the next Join mints a Meet
    //                             link instead of reopening the tutor's room.
    //   generated -> generated    nothing: the cached Meet link stays.
    if (input.meeting_link_mode !== undefined) {
      const linkState = await readClassLinkState(service, classId);

      if (input.meeting_link_mode === 'custom') {
        if (!linkState.modeColumn) {
          return NextResponse.json(
            {
              ok: false,
              error: 'link_mode_unavailable',
              message: "Using your own class link isn't available yet. Generate links with Google Meet for now.",
            },
            { status: 409 },
          );
        }
        const normalized = normalizeClassLinkUrl(
          input.meeting_link ?? (linkState.mode === 'custom' ? linkState.link : undefined),
        );
        if (!normalized.ok) {
          return NextResponse.json(
            { ok: false, error: 'validation_failed', details: [{ field: 'meeting_link', message: normalized.error }] },
            { status: 400 },
          );
        }
        updates.meeting_link_mode = 'custom';
        updates.meeting_link = normalized.url;
        // A tutor's own link is not a minted one: no 30-day reuse clock applies.
        updates.meeting_link_generated_at = null;
      } else if (linkState.mode === 'custom') {
        updates.meeting_link_mode = 'generated';
        updates.meeting_link = null;
        updates.meeting_link_generated_at = null;
      }
    }

    // Nothing to write — a mode resent unchanged, say. Answer with the row as
    // it stands rather than sending PostgREST an empty update.
    if (Object.keys(updates).length === 0) {
      const { data: current, error: readError } = await service
        .from('groups')
        .select()
        .eq('id', classId)
        .single();
      if (readError) throw readError;
      return NextResponse.json({ ok: true, class: current });
    }

    const runUpdate = (patch: Record<string, unknown>) =>
      service.from('groups').update(patch).eq('id', classId).select().single();

    let { data: updated, error: updateError } = await runUpdate(updates);
    // meeting_link_generated_at is migration 188. Every database with 262 has
    // it, but a custom -> generated switch is not worth failing over it.
    if (updateError && isSchemaMismatch(updateError) && 'meeting_link_generated_at' in updates) {
      const { meeting_link_generated_at: _drop, ...withoutGeneratedAt } = updates;
      ({ data: updated, error: updateError } = await runUpdate(withoutGeneratedAt));
    }

    if (updateError) throw updateError;

    // The group_feedback_settings / group_feedback_periods side effects that used
    // to run here are gone with those tables. The period-and-deadline model they
    // served is replaced by the request-driven one in migrations 221/222, which
    // has no per-class enable flag and no periods to open or close — a family
    // asks, and the tutor answers or does not.
    //
    // groups.feedback_mode and groups.parent_feedback_price are still written
    // above. They no longer drive any feedback behaviour and are inert pending a
    // decision on the paid-feedback add-on they price (see §12.3); they are left
    // alone here rather than silently dropped, because they are also read by the
    // student and parent class pages to display pricing.

    await auditAdminOverride(actor, 'settings.update', { fields: Object.keys(updates) });

    return NextResponse.json({ ok: true, class: updated });
  } catch (err) {
    console.error('[PATCH /api/classes/[id]/settings]', err);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

// GET /api/groups/[groupId]/class-payments
// Returns all billing ledger rows for this class, joined with member profile info.
// Tutor-only.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { data: group } = await service
      .from('groups')
      .select('id, tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all members for this group first
    const { data: members, error: membersErr } = await service
      .from('group_members')
      .select('id, user_id, status, profile:profiles!group_members_user_id_fkey(id, full_name, avatar_url)')
      .eq('group_id', groupId);

    if (membersErr) throw membersErr;

    const memberIds = (members ?? []).map((m: any) => m.id);

    if (memberIds.length === 0) {
      return NextResponse.json({ payments: [], members: [] });
    }

    // Fetch class_payments for all members
    const { data: payments, error: paymentsErr } = await service
      .from('class_payments')
      .select('id, class_member_id, session_id, billing_period, block_id, amount, status, paid_at, created_at')
      .in('class_member_id', memberIds)
      .order('created_at', { ascending: false });

    if (paymentsErr) {
      // Table may not exist if migration 129 wasn't applied yet
      console.warn('[class-payments] class_payments table not accessible:', paymentsErr.message);
      return NextResponse.json({ payments: [], members: members ?? [] });
    }

    return NextResponse.json({ payments: payments ?? [], members: members ?? [] });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]/class-payments]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/groups/[groupId]/class-payments/[paymentId]
// Mark a payment as waived. Tutor-only.
// Note: individual payment ID is passed as a query param since Next.js
// doesn't support nested dynamic segments in the same file.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const url = new URL(request.url);
    const paymentId = url.searchParams.get('paymentId');
    if (!paymentId) return NextResponse.json({ error: 'paymentId query param required' }, { status: 400 });

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { data: group } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { action } = await request.json() as { action: 'waive' };
    if (action !== 'waive') return NextResponse.json({ error: 'Only action=waive is supported' }, { status: 400 });

    // Verify payment belongs to this group via member
    const { data: payment } = await service
      .from('class_payments')
      .select('id, class_member_id, status')
      .eq('id', paymentId)
      .single();

    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

    // Confirm the member belongs to this group
    const { data: member } = await service
      .from('group_members')
      .select('id')
      .eq('id', payment.class_member_id)
      .eq('group_id', groupId)
      .single();

    if (!member) return NextResponse.json({ error: 'Payment does not belong to this group' }, { status: 403 });

    const { data: updated, error: updateErr } = await service
      .from('class_payments')
      .update({ status: 'waived' })
      .eq('id', paymentId)
      .select()
      .single();

    if (updateErr) throw updateErr;
    return NextResponse.json({ payment: updated });
  } catch (err) {
    console.error('[PATCH /api/groups/[groupId]/class-payments]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

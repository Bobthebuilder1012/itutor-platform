// =====================================================
// AUTH HELPERS for API Route Handlers
// =====================================================

import { getServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function getAuthenticatedUserId(): Promise<
  { userId: string; error: null } | { userId: null; error: NextResponse }
> {
  const client = await getServerClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    return {
      userId: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { userId: user.id, error: null };
}

export async function requireAdmin(userId: string): Promise<boolean> {
  const { getServiceClient } = await import('@/lib/supabase/server');
  const db = getServiceClient();
  const { data } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

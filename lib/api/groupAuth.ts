import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/adminAccess';

export async function authenticateUser() {
  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function requireTutor(userId: string) {
  const service = getServiceClient();
  const { data } = await service.from('profiles').select('id, role').eq('id', userId).single();
  return data?.role === 'tutor';
}

export async function requireGroupOwner(groupId: string, userId: string) {
  const service = getServiceClient();
  const { data } = await service.from('groups').select('id, tutor_id').eq('id', groupId).maybeSingle();
  if (!data) return false;
  if (data.tutor_id === userId) return true;            // owner fast path — unchanged
  // Non-owner: allow a superadmin to act as the tutor (authorization-widening,
  // not impersonation). Only path that needs the caller's email, so look it up
  // here — it runs only when the caller is not the owner (rare).
  const { data: profile } = await service
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  return isSuperAdmin(profile?.email);
}


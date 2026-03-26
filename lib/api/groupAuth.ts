import { getServerClient, getServiceClient } from '@/lib/supabase/server';

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
  const { data } = await service.from('groups').select('id, tutor_id').eq('id', groupId).single();
  return data?.tutor_id === userId;
}


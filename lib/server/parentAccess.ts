import { getServiceClient, getServerClient } from '@/lib/supabase/server';

type ParentProfile = {
  id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  country: string | null;
};

type ChildProfile = {
  id: string;
  role: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  school: string | null;
  form_level: string | null;
  institution_id: string | null;
  billing_mode: string | null;
};

export class ParentAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = 'ParentAccessError';
    this.status = status;
  }
}

export async function requireParentContext() {
  const serverClient = await getServerClient();
  const admin = getServiceClient();

  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    throw new ParentAccessError('Unauthorized', 401);
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, full_name, email, country')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new ParentAccessError('Parent profile not found', 404);
  }

  if (profile.role !== 'parent') {
    throw new ParentAccessError('Only parents can access this resource', 403);
  }

  return {
    admin,
    serverClient,
    user,
    parentProfile: profile as ParentProfile,
  };
}

export async function requireParentChild(
  parentId: string,
  childId: string
): Promise<ChildProfile> {
  const admin = getServiceClient();

  const { data: link, error: linkError } = await admin
    .from('parent_child_links')
    .select('child_id')
    .eq('parent_id', parentId)
    .eq('child_id', childId)
    .maybeSingle();

  if (linkError) {
    throw new ParentAccessError('Failed to verify child access', 500);
  }

  if (!link) {
    throw new ParentAccessError('Child not found', 404);
  }

  const { data: child, error: childError } = await admin
    .from('profiles')
    .select(
      'id, role, full_name, display_name, email, school, form_level, institution_id, billing_mode'
    )
    .eq('id', childId)
    .single();

  if (childError || !child) {
    throw new ParentAccessError('Child profile not found', 404);
  }

  return child as ChildProfile;
}

export async function getParentChildIds(parentId: string): Promise<string[]> {
  const admin = getServiceClient();
  const { data, error } = await admin
    .from('parent_child_links')
    .select('child_id')
    .eq('parent_id', parentId);

  if (error) {
    throw new ParentAccessError('Failed to load linked children', 500);
  }

  return (data ?? []).map((row) => row.child_id);
}

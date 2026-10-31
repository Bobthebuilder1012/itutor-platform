// Per-person gate for the Customer.io calls that only know a user id (events and delete).
// Syncing a profile already checks the person's email in isProfileSyncable.
//
// Production: always true, with no database lookup (behaviour unchanged).
// Outside production: the person's email must pass the shared EMAIL_ALLOWLIST rule
// (lib/email/allowlist.ts). An unknown user or a lookup failure is refused.

import { getServiceClient } from '@/lib/supabase/server';
import { checkRecipient, isProductionRuntime } from '@/lib/email/allowlist';

export async function userMaySync(userId: string): Promise<boolean> {
  if (isProductionRuntime()) return true;
  try {
    const { data } = await getServiceClient().from('profiles').select('email').eq('id', userId).maybeSingle();
    return checkRecipient((data as { email?: string | null } | null)?.email).allowed;
  } catch {
    return false;
  }
}

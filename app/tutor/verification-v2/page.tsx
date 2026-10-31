import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import TutorShell from '@/components/tutor/TutorShell';
import VerificationV2Flow from '@/components/tutor/verificationV2/VerificationV2Flow';

// The flag is read per request, so flipping VERIFICATION_V2_ENABLED needs no rebuild.
export const dynamic = 'force-dynamic';

export default async function TutorVerificationV2Page() {
  if (!isVerificationV2Enabled()) notFound();

  // Signed out: send them to the login page from the server, instead of showing the shell and
  // letting the browser find out. (The state route also answers 401, so this is not the only guard.)
  const cookieStore = cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
    },
  });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  return (
    <TutorShell>
      <VerificationV2Flow />
    </TutorShell>
  );
}

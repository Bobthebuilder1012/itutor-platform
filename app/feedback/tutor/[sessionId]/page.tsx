import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import TutorSessionFeedbackForm from '@/components/feedback/TutorSessionFeedbackForm';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function displayName(p: { display_name?: string | null; full_name?: string | null; username?: string | null }) {
  return p.display_name || p.full_name || p.username || 'Student';
}

export default async function TutorSessionFeedbackPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'tutor') redirect('/login');

  const { data: session } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, scheduled_start_at, scheduled_end_at, status')
    .eq('id', sessionId)
    .single();

  if (!session || session.tutor_id !== user.id) redirect('/tutor/dashboard');

  if (session.status === 'CANCELLED') redirect('/tutor/dashboard');
  if (new Date(session.scheduled_end_at).getTime() > Date.now()) redirect('/tutor/dashboard');

  const { data: existingFeedback } = await supabase
    .from('tutor_feedback')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (existingFeedback?.id) redirect('/tutor/dashboard');

  const admin = getServiceClient();
  const { data: student } = await admin
    .from('profiles')
    .select('display_name, full_name, username')
    .eq('id', session.student_id)
    .single();

  return (
    <TutorSessionFeedbackForm
      sessionId={sessionId}
      studentName={displayName(student || {})}
      scheduledStartAt={session.scheduled_start_at}
      scheduledEndAt={session.scheduled_end_at}
      redirectTo="/tutor/dashboard"
    />
  );
}


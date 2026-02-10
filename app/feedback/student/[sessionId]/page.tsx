import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import StudentSessionRatingForm from '@/components/feedback/StudentSessionRatingForm';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function displayName(p: { display_name?: string | null; full_name?: string | null; username?: string | null }) {
  return p.display_name || p.full_name || p.username || 'Tutor';
}

export default async function StudentSessionFeedbackPage({
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

  if (!profile || profile.role !== 'student') redirect('/login');

  const { data: session } = await supabase
    .from('sessions')
    .select('id, student_id, tutor_id, scheduled_start_at, scheduled_end_at, status')
    .eq('id', sessionId)
    .single();

  if (!session || session.student_id !== user.id) redirect('/student/dashboard');

  if (session.status === 'CANCELLED') redirect('/student/dashboard');
  if (new Date(session.scheduled_end_at).getTime() > Date.now()) redirect('/student/dashboard');

  const { data: existingRating } = await supabase
    .from('ratings')
    .select('id')
    .eq('student_id', user.id)
    .eq('tutor_id', session.tutor_id)
    .maybeSingle();

  if (existingRating?.id) redirect('/student/dashboard');

  const admin = getServiceClient();
  const { data: tutor } = await admin
    .from('profiles')
    .select('display_name, full_name, username')
    .eq('id', session.tutor_id)
    .single();

  return (
    <StudentSessionRatingForm
      sessionId={sessionId}
      tutorName={displayName(tutor || {})}
      scheduledStartAt={session.scheduled_start_at}
      scheduledEndAt={session.scheduled_end_at}
      redirectTo="/student/dashboard"
    />
  );
}


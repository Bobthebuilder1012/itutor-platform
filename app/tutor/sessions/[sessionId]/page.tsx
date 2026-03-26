import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function TutorSessionDetailPage({ params }: PageProps) {
  redirect('/tutor/dashboard');
}

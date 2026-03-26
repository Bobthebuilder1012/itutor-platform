import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ childId: string }>;
}

export default async function ChildSessionsPage({ params }: PageProps) {
  const { childId } = await params;
  redirect(`/parent/child/${childId}`);
}

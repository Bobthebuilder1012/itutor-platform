'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function TutorLessonDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string | undefined;

  useEffect(() => {
    if (id) router.replace(`/lessons/${id}`);
    else router.replace('/tutor/lessons');
  }, [id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
    </div>
  );
}

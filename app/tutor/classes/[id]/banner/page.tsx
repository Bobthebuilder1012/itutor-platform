'use client';

import { useParams } from 'next/navigation';
import TutorShell from '@/components/tutor/TutorShell';
import BannerBuilder from '@/components/tutor/banner/BannerBuilder';

export default function ClassBannerBuilderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <TutorShell>
      <div className="px-4 lg:px-8 py-6">
        <BannerBuilder mode="class" classId={id} backHref={`/tutor/classes/${id}`} />
      </div>
    </TutorShell>
  );
}

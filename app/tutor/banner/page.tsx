'use client';

import TutorShell from '@/components/tutor/TutorShell';
import BannerBuilder from '@/components/tutor/banner/BannerBuilder';

export default function ProfileBannerBuilderPage() {
  return (
    <TutorShell>
      <div className="px-4 lg:px-8 py-6">
        <BannerBuilder mode="profile" backHref="/tutor/business" />
      </div>
    </TutorShell>
  );
}

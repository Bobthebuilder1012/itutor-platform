import { redirect } from 'next/navigation';
import StudentTutorsBrowseClient from '@/app/(student)/tutors/StudentTutorsBrowseClient';
import { isGroupsFeatureEnabled } from '@/lib/featureFlags/groupsFeature';

export default function StudentGroupsPage() {
  if (!isGroupsFeatureEnabled()) {
    redirect('/student/dashboard');
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Discover Lesson Sessions</h1>
      <p className="mt-1 text-sm text-gray-600">Browse expert-led lessons in a marketplace-style catalog.</p>
      <div className="mt-6">
        <StudentTutorsBrowseClient />
      </div>
    </main>
  );
}


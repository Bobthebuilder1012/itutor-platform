import StudentTutorsBrowseClient from '@/app/(student)/tutors/StudentTutorsBrowseClient';

export default function StudentGroupsPage() {
  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Discover Group Sessions</h1>
      <p className="mt-1 text-sm text-gray-600">Browse expert-led groups in a marketplace-style catalog.</p>
      <div className="mt-6">
        <StudentTutorsBrowseClient />
      </div>
    </main>
  );
}


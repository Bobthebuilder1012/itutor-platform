'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentDashboardTabs from '@/components/student/StudentDashboardTabs';

export default function StudentGroupsDashboardPage() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-5xl p-4 md:p-8">
        <h1 className="text-2xl font-bold text-gray-900">Student Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Track your group sessions, enrollments, and notifications.</p>
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          <StudentDashboardTabs />
        </div>
      </main>
    </QueryClientProvider>
  );
}


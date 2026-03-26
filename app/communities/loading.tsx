import DashboardLayout from '@/components/DashboardLayout';

export default function CommunitiesLoading() {
  return (
    <DashboardLayout role="student" userName="…">
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
        <div className="h-7 w-48 rounded-lg bg-gray-200 animate-pulse mb-6" />
        <div className="space-y-6">
          {/* School header skeleton */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 animate-pulse">
            <div className="h-5 w-56 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
          </div>
          {/* My Communities skeleton */}
          <div>
            <div className="h-5 w-40 bg-gray-200 rounded mb-3 animate-pulse" />
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
          {/* Join section skeleton */}
          <div>
            <div className="h-5 w-44 bg-gray-200 rounded mb-3 animate-pulse" />
            <div className="h-10 w-full rounded-xl bg-gray-100 animate-pulse mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

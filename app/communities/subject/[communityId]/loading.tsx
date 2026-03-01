import DashboardLayout from '@/components/DashboardLayout';

export default function SubjectCommunityLoading() {
  return (
    <DashboardLayout role="student" userName="…">
      <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[400px] -m-3 sm:-m-4 lg:-m-6 w-[calc(100%+1.5rem)] sm:w-[calc(100%+2rem)] lg:w-[calc(100%+3rem)]">
        <div className="flex-shrink-0 flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 flex flex-col px-4 py-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 rounded-2xl bg-gray-100 animate-pulse" style={{ width: i % 2 ? '75%' : '60%', marginLeft: i % 2 ? 0 : 'auto' }} />
            ))}
            <div className="flex-shrink-0 flex gap-2 pt-4">
              <div className="flex-1 h-10 rounded-xl bg-gray-100 animate-pulse" />
              <div className="h-10 w-20 rounded-xl bg-gray-100 animate-pulse" />
            </div>
          </div>
          <aside className="hidden lg:block lg:w-[300px] lg:flex-shrink-0 lg:border-l lg:border-gray-200 lg:bg-gray-50/80 p-4 space-y-4">
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-4 w-full bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse pt-4" />
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

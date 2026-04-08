'use client';

type StatsRowProps = {
  completedSessions: number;
  totalHours: number;
  loading: boolean;
  subjectsCount?: number;
};

export default function StatsRow({ completedSessions, totalHours, loading, subjectsCount = 0 }: StatsRowProps) {
  const stats = [
    {
      label: 'Completed Sessions',
      value: loading ? '—' : completedSessions,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
      color: 'text-itutor-green',
      pillBg: 'bg-itutor-green/10 text-itutor-green',
    },
    {
      label: 'Hours Learned',
      value: loading ? '—' : totalHours,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
          <circle cx="12" cy="12" r="10" strokeWidth={1.8} />
          <path strokeLinecap="round" strokeWidth={1.8} d="M12 6v6l4 2" />
        </svg>
      ),
      color: 'text-gray-900',
      pillBg: 'bg-gray-100 text-gray-600',
    },
    {
      label: 'Subjects Enrolled',
      value: loading ? '—' : subjectsCount,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      color: 'text-gray-900',
      pillBg: 'bg-gray-100 text-gray-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-4"
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${s.pillBg}`}>
            {s.icon}
          </div>
          <div>
            <p className={`text-3xl font-bold leading-none mb-1 ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeaturesChecklist() {
  const features = [
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      title: 'CSEC & CAPE Aligned',
      description: 'Curriculum-specific support designed for Caribbean exam success.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      title: 'Flexible Scheduling',
      description: 'Book sessions that fit your schedule, day or night.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
      title: 'Trusted iTutors',
      description: 'Verified educators with proven track records of student success.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      ),
      title: 'Exam-Focused Support',
      description: 'Strategic preparation targeting the specific areas you need most.',
    },
  ];

  return (
    <section className="bg-gradient-to-b from-itutor-white to-gray-50 py-16 sm:py-24 relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]"></div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-itutor-black mb-4 text-center">
          Everything You Need in One Place
        </h2>
        <p className="text-center text-itutor-muted mb-12 max-w-2xl mx-auto">
          Comprehensive support for your CSEC and CAPE journey
        </p>

        <div className="max-w-4xl mx-auto">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`flex gap-6 py-8 px-6 rounded-2xl hover:bg-white hover:shadow-xl transition-all duration-300 ${
                index !== features.length - 1 ? 'border-b border-itutor-border/50' : ''
              }`}
            >
              <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-itutor-green to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-itutor-green/30">
                {feature.icon}
              </div>
              <div>
                <h3 className="text-xl font-bold text-itutor-black mb-2">
                  {feature.title}
                </h3>
                <p className="text-itutor-muted leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


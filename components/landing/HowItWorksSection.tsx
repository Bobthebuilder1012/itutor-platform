const steps = [
  {
    number: '01',
    title: 'Find Your iTutor',
    description: 'Browse verified Caribbean tutors by subject, rating, and school. Filter to find your perfect match.',
    icon: (
      <svg width="32" height="32" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
      </svg>
    ),
    iconBg: '#ede9fe',
    tag: '150+ verified tutors',
  },
  {
    number: '02',
    title: 'Book a Session',
    description: 'Pick a time that fits your schedule. Sessions run on Google Meet or Zoom — no extra setup needed.',
    icon: (
      <svg width="32" height="32" fill="none" stroke="#db2777" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        <rect x="7" y="14" width="3" height="3" rx="0.5" fill="#db2777"/><rect x="14" y="14" width="3" height="3" rx="0.5" fill="#db2777"/>
      </svg>
    ),
    iconBg: '#fce7f3',
    tag: 'Flexible scheduling',
  },
  {
    number: '03',
    title: 'Learn & Grow',
    description: 'Get personalized 1-on-1 tutoring built around your learning style, pace, and exam goals.',
    icon: (
      <svg width="32" height="32" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
      </svg>
    ),
    iconBg: '#dcfce7',
    tag: 'CSEC & CAPE Aligned',
  },
  {
    number: '04',
    title: 'Ace Your Exams',
    description: 'Track progress, build confidence, and walk into your exam knowing you\'re ready.',
    icon: (
      <svg width="32" height="32" fill="none" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="#ea580c"/>
        <line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/>
      </svg>
    ),
    iconBg: '#ffedd5',
    tag: '94% Grade I–II rate',
  },
];

export default function HowItWorksSection() {
  return (
    <section className="relative bg-transparent py-20 sm:py-28">
      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-14 text-center">
          <h2
            className="mb-3 font-bold text-[#052e1a]"
            style={{ fontSize: 'clamp(36px,5vw,60px)', letterSpacing: '-0.03em', lineHeight: '1.08' }}
          >
            How It{' '}
            <span className="bg-gradient-to-r from-[#16a34a] to-[#22c55e] bg-clip-text text-transparent">
              Works
            </span>
          </h2>
          <p className="mx-auto max-w-[520px] text-lg text-[#4b5563]">
            From first search to final exam — a clear path to your best grades.
          </p>
        </div>

        {/* Cards */}
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={index} className="relative">

              {/* Dashed connector */}
              {index < steps.length - 1 && (
                <div
                  className="absolute -right-3 top-16 hidden w-6 lg:block"
                  style={{ borderTop: '2px dashed #86efac', zIndex: 10 }}
                />
              )}

              <div className="relative h-full rounded-3xl bg-white/80 border border-gray-100 p-7 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">

                {/* Number badge */}
                <div
                  className="absolute -top-4 left-6 flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-white shadow-md"
                  style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}
                >
                  {step.number}
                </div>

                {/* Icon box */}
                <div
                  className="mb-5 mt-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ background: step.iconBg }}
                >
                  {step.icon}
                </div>

                {/* Title */}
                <h3 className="mb-2.5 text-[18px] font-extrabold tracking-tight text-[#0a0f0d]">
                  {step.title}
                </h3>

                {/* Description */}
                <p className="mb-5 text-[14px] leading-relaxed text-[#6b7280]">
                  {step.description}
                </p>

                {/* Tag */}
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#16a34a]">
                  <svg width="14" height="14" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {step.tag}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

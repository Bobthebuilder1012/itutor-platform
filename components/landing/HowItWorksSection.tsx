const steps = [
  {
    number: '01',
    title: 'Find Your iTutor',
    description: 'Browse verified iTutors by subject, rating, and school. Filter to find your perfect match.',
    icon: '🔍',
    gradient: 'from-blue-500 to-cyan-500',
    orbColor: 'bg-blue-400',
  },
  {
    number: '02',
    title: 'Book a Session',
    description: 'Choose a time that works for you. Pick between Google Meet or Zoom for your online session.',
    icon: '📅',
    gradient: 'from-purple-500 to-pink-500',
    orbColor: 'bg-purple-400',
  },
  {
    number: '03',
    title: 'Learn & Grow',
    description: 'Get personalized 1-on-1 tutoring tailored to your learning style and exam goals.',
    icon: '📚',
    gradient: 'from-[#10b981] to-[#34d399]',
    orbColor: 'bg-emerald-400',
  },
  {
    number: '04',
    title: 'Ace Your Exams',
    description: 'Track your progress, build confidence, and achieve the grades you deserve.',
    icon: '🎯',
    gradient: 'from-orange-500 to-amber-400',
    orbColor: 'bg-orange-400',
  },
];

export default function HowItWorksSection() {
  return (
    <section className="relative bg-transparent py-[90px] sm:py-28 2xl:py-40 3xl:py-52">
      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 3xl:px-16">
        <div className="mb-11 text-center 2xl:mb-16">
          <h2
            className="mb-3 font-bold text-[#052e1a] 2xl:mb-5"
            style={{ fontSize: 'clamp(38px,5.5vw,64px)', letterSpacing: '-0.03em', lineHeight: '1.05' }}
          >
            How It{' '}
            <span className="bg-gradient-to-r from-[#16a34a] to-[#22c55e] bg-clip-text font-instrument italic text-transparent">
              Works
            </span>
          </h2>
          <p className="mx-auto max-w-[600px] text-lg text-[#4b5563] sm:text-xl 2xl:text-2xl">
            Get started in minutes. Success in 4 simple steps.
          </p>
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-[22px] md:grid-cols-2 lg:grid-cols-4 2xl:max-w-[1600px] 2xl:gap-7 3xl:max-w-[1900px]">
          {steps.map((step, index) => (
            <div key={index} className="group relative">
              {index < steps.length - 1 && (
                <div className="absolute -right-[18px] top-20 hidden h-px w-9 bg-gradient-to-r from-[#16a34a]/40 to-transparent lg:block 2xl:-right-[22px] 2xl:w-11" />
              )}

              <div
                className="relative h-full min-h-[340px] overflow-hidden rounded-3xl border border-white/70 p-7 transition-all duration-300 hover:-translate-y-1.5 sm:p-8 2xl:p-9 3xl:p-12"
                style={{
                  background: 'linear-gradient(135deg,rgba(255,255,255,0.72) 0%,rgba(255,255,255,0.4) 50%,rgba(255,255,255,0.2) 100%)',
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                  boxShadow: '0 8px 32px rgba(22,163,74,0.08),0 2px 8px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.8)',
                }}
              >
                {/* Orb */}
                <div
                  className={`pointer-events-none absolute -right-10 -top-10 h-[140px] w-[140px] rounded-full opacity-50 blur-[30px] ${step.orbColor}`}
                />

                <span
                  className={`relative z-10 mb-[18px] inline-flex self-start rounded-full px-4 py-1.5 text-sm font-extrabold text-white bg-gradient-to-r ${step.gradient}`}
                  style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.15),inset 0 1px 0 rgba(255,255,255,0.3)' }}
                >
                  {step.number}
                </span>

                <div className="relative z-10 mb-[18px] text-[52px] leading-none transition-transform duration-300 group-hover:scale-110 2xl:text-[60px] 3xl:text-[72px]">
                  {step.icon}
                </div>

                <h3 className="relative z-10 mb-3 text-2xl font-extrabold tracking-tight text-[#0a0f0d] 2xl:text-3xl 3xl:text-4xl">
                  {step.title}
                </h3>
                <p className="relative z-10 text-[15px] leading-relaxed text-[#4b5563] 2xl:text-base">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HowItWorksSection() {
  const steps = [
    {
      number: "01",
      title: "Find Your iTutor",
      description: "Browse verified iTutors by subject, rating, and school. Filter to find your perfect match.",
      icon: "🔍",
      color: "from-blue-500 to-cyan-500"
    },
    {
      number: "02",
      title: "Book a Session",
      description: "Choose a time that works for you. Pick between Google Meet or Zoom for your online session.",
      icon: "📅",
      color: "from-purple-500 to-pink-500"
    },
    {
      number: "03",
      title: "Learn & Grow",
      description: "Get personalized 1-on-1 tutoring tailored to your learning style and exam goals.",
      icon: "📚",
      color: "from-itutor-green to-emerald-500"
    },
    {
      number: "04",
      title: "Ace Your Exams",
      description: "Track your progress, build confidence, and achieve the grades you deserve.",
      icon: "🎯",
      color: "from-orange-500 to-red-500"
    }
  ];

  return (
    <section className="relative overflow-hidden bg-transparent py-20 sm:py-28 2xl:py-40 3xl:py-52">
      <div
        className="pointer-events-none absolute inset-0 bg-white/10"
        aria-hidden
      />
      {/* Circuit Pattern Background */}
      <div className="absolute inset-0 opacity-[0.06]">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 304 304' width='304' height='304'%3E%3Cpath fill='%2310B981' fill-opacity='0.4' d='M44.1 224a5 5 0 1 1 0 2H0v-2h44.1zm160 48a5 5 0 1 1 0 2H82v-2h122.1zm57.8-46a5 5 0 1 1 0-2H304v2h-42.1zm0 16a5 5 0 1 1 0-2H304v2h-42.1zm6.2-114a5 5 0 1 1 0 2h-86.2a5 5 0 1 1 0-2h86.2zm-256-48a5 5 0 1 1 0 2H0v-2h12.1zm185.8 34a5 5 0 1 1 0-2h86.2a5 5 0 1 1 0 2h-86.2zM258 12.1a5 5 0 1 1-2 0V0h2v12.1zm-64 208a5 5 0 1 1-2 0v-54.2a5 5 0 1 1 2 0v54.2zm48-198.2V80h62v2h-64V21.9a5 5 0 1 1 2 0zm16 16V64h46v2h-48V37.9a5 5 0 1 1 2 0zm-128 96V208h16v12.1a5 5 0 1 1-2 0V210h-16v-76.1a5 5 0 1 1 2 0zm-5.9-21.9a5 5 0 1 1 0 2H114v48H85.9a5 5 0 1 1 0-2H112v-48h12.1zm-6.2 130a5 5 0 1 1 0-2H176v-74.1a5 5 0 1 1 2 0V242h-60.1zm-16-64a5 5 0 1 1 0-2H114v48h10.1a5 5 0 1 1 0 2H112v-48h-10.1zM66 284.1a5 5 0 1 1-2 0V274H50v30h-2v-32h18v12.1zM236.1 176a5 5 0 1 1 0 2H226v94h48v32h-2v-30h-48v-98h12.1zm25.8-30a5 5 0 1 1 0-2H274v44.1a5 5 0 1 1-2 0V146h-10.1zm-64 96a5 5 0 1 1 0-2H208v-80h16v-14.1a5 5 0 1 1 2 0V108h-18v82h-12.1zm86.2-210a5 5 0 1 1 0 2H272V0h2v32h10.1zM98 101.9V146H53.9a5 5 0 1 1 0-2H96v-42.1a5 5 0 1 1 2 0zM53.9 34a5 5 0 1 1 0-2H80V0h2v34H53.9zm60.1 3.9V66H82v64H69.9a5 5 0 1 1 0-2H80V64h32V37.9a5 5 0 1 1 2 0zM101.9 82a5 5 0 1 1 0-2H128V37.9a5 5 0 1 1 2 0V82h-28.1zm16-64a5 5 0 1 1 0-2H146v44.1a5 5 0 1 1-2 0V18h-26.1zm102.2 270a5 5 0 1 1 0 2H98v14h-2v-16h124.1zM242 149.9V160h16v34h-16v62h48v48h-2v-46h-48v-66h16v-30h-16v-12.1a5 5 0 1 1 2 0zM53.9 18a5 5 0 1 1 0-2H64V2H48V0h18v18H53.9zm112 32a5 5 0 1 1 0-2H192V0h50v2h-48v48h-28.1zm-48-48a5 5 0 0 1-9.8-2h2.07a3 3 0 1 0 5.66 0H178v34h-18V21.9a5 5 0 1 1 2 0V32h14V2h-58.1zm0 96a5 5 0 1 1 0-2H137l32-32h39V21.9a5 5 0 1 1 2 0V66h-40.17l-32 32H117.9z'/%3E%3C/svg%3E")`,
        }}></div>
      </div>
      
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 h-72 w-72 rounded-full bg-white/[0.02] blur-3xl"></div>
        <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-white/[0.02] blur-3xl"></div>
      </div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.04]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(#199356 1px, transparent 1px), linear-gradient(90deg, #199356 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        ></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 3xl:px-16 relative z-10">
        {/* Section Header */}
        <div className="mb-16 text-center 2xl:mb-24 3xl:mb-32">
          <h2 className="mb-6 text-3xl font-bold text-gray-900 sm:text-5xl lg:text-6xl 2xl:mb-8 2xl:text-7xl 3xl:mb-10 3xl:text-8xl">
            How It{' '}
            <span className="text-itutor-green">
              Works
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-base text-gray-600 sm:text-xl 2xl:max-w-4xl 2xl:text-2xl 3xl:max-w-5xl 3xl:text-3xl">
            Get started in minutes. Success in 4 simple steps.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto 2xl:gap-10 2xl:max-w-[1600px] 3xl:gap-14 3xl:max-w-[1900px]">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative group"
            >
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="absolute top-20 -right-4 hidden h-0.5 w-8 bg-gradient-to-r from-itutor-green/40 to-transparent lg:block 2xl:-right-5 2xl:w-10 3xl:-right-7 3xl:w-14"></div>
              )}

              <div className="h-full rounded-3xl border border-white/60 bg-gradient-to-br from-white/70 via-white/40 to-white/20 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-8px_16px_rgba(255,255,255,0.1)] ring-1 ring-inset ring-white/50 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 hover:scale-[1.03] hover:border-white/80 hover:from-white/80 hover:via-white/55 hover:to-white/30 hover:shadow-[0_16px_48px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] 2xl:p-9 3xl:p-12">
                {/* Step Number */}
                <div className={`inline-block px-4 py-1 rounded-full bg-gradient-to-r ${step.color} text-white font-bold text-sm mb-4 2xl:px-5 2xl:py-1.5 2xl:text-base 2xl:mb-5 3xl:px-7 3xl:py-2 3xl:text-lg 3xl:mb-7`}>
                  {step.number}
                </div>

                {/* Icon */}
                <div className="text-6xl mb-4 group-hover:scale-110 transition-transform duration-300 2xl:text-7xl 2xl:mb-5 3xl:text-8xl 3xl:mb-7">
                  {step.icon}
                </div>

                {/* Content */}
                <h3 className="mb-3 text-2xl font-bold text-gray-900 transition-colors group-hover:text-itutor-green 2xl:mb-4 2xl:text-3xl 3xl:mb-5 3xl:text-4xl">
                  {step.title}
                </h3>
                <p className="leading-relaxed text-gray-600 2xl:text-lg 3xl:text-xl">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


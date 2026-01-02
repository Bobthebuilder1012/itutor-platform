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
    <section className="relative bg-gradient-to-b from-itutor-black via-gray-900 to-itutor-black py-20 sm:py-28 overflow-hidden">
      {/* Circuit Pattern Background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 304 304' width='304' height='304'%3E%3Cpath fill='%2310B981' fill-opacity='0.4' d='M44.1 224a5 5 0 1 1 0 2H0v-2h44.1zm160 48a5 5 0 1 1 0 2H82v-2h122.1zm57.8-46a5 5 0 1 1 0-2H304v2h-42.1zm0 16a5 5 0 1 1 0-2H304v2h-42.1zm6.2-114a5 5 0 1 1 0 2h-86.2a5 5 0 1 1 0-2h86.2zm-256-48a5 5 0 1 1 0 2H0v-2h12.1zm185.8 34a5 5 0 1 1 0-2h86.2a5 5 0 1 1 0 2h-86.2zM258 12.1a5 5 0 1 1-2 0V0h2v12.1zm-64 208a5 5 0 1 1-2 0v-54.2a5 5 0 1 1 2 0v54.2zm48-198.2V80h62v2h-64V21.9a5 5 0 1 1 2 0zm16 16V64h46v2h-48V37.9a5 5 0 1 1 2 0zm-128 96V208h16v12.1a5 5 0 1 1-2 0V210h-16v-76.1a5 5 0 1 1 2 0zm-5.9-21.9a5 5 0 1 1 0 2H114v48H85.9a5 5 0 1 1 0-2H112v-48h12.1zm-6.2 130a5 5 0 1 1 0-2H176v-74.1a5 5 0 1 1 2 0V242h-60.1zm-16-64a5 5 0 1 1 0-2H114v48h10.1a5 5 0 1 1 0 2H112v-48h-10.1zM66 284.1a5 5 0 1 1-2 0V274H50v30h-2v-32h18v12.1zM236.1 176a5 5 0 1 1 0 2H226v94h48v32h-2v-30h-48v-98h12.1zm25.8-30a5 5 0 1 1 0-2H274v44.1a5 5 0 1 1-2 0V146h-10.1zm-64 96a5 5 0 1 1 0-2H208v-80h16v-14.1a5 5 0 1 1 2 0V108h-18v82h-12.1zm86.2-210a5 5 0 1 1 0 2H272V0h2v32h10.1zM98 101.9V146H53.9a5 5 0 1 1 0-2H96v-42.1a5 5 0 1 1 2 0zM53.9 34a5 5 0 1 1 0-2H80V0h2v34H53.9zm60.1 3.9V66H82v64H69.9a5 5 0 1 1 0-2H80V64h32V37.9a5 5 0 1 1 2 0zM101.9 82a5 5 0 1 1 0-2H128V37.9a5 5 0 1 1 2 0V82h-28.1zm16-64a5 5 0 1 1 0-2H146v44.1a5 5 0 1 1-2 0V18h-26.1zm102.2 270a5 5 0 1 1 0 2H98v14h-2v-16h124.1zM242 149.9V160h16v34h-16v62h48v48h-2v-46h-48v-66h16v-30h-16v-12.1a5 5 0 1 1 2 0zM53.9 18a5 5 0 1 1 0-2H64V2H48V0h18v18H53.9zm112 32a5 5 0 1 1 0-2H192V0h50v2h-48v48h-28.1zm-48-48a5 5 0 0 1-9.8-2h2.07a3 3 0 1 0 5.66 0H178v34h-18V21.9a5 5 0 1 1 2 0V32h14V2h-58.1zm0 96a5 5 0 1 1 0-2H137l32-32h39V21.9a5 5 0 1 1 2 0V66h-40.17l-32 32H117.9z'/%3E%3C/svg%3E")`,
        }}></div>
      </div>
      
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-itutor-green/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }}></div>
      </div>
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(#10B981 1px, transparent 1px), linear-gradient(90deg, #10B981 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-itutor-white mb-6">
            How It{' '}
            <span className="text-transparent bg-gradient-to-r from-itutor-green to-emerald-400 bg-clip-text">
              Works
            </span>
          </h2>
          <p className="text-xl text-itutor-muted max-w-2xl mx-auto">
            Get started in minutes. Success in 4 simple steps.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative group"
            >
              {/* Connector Line (hidden on mobile, shown on desktop between cards) */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-20 -right-4 w-8 h-0.5 bg-gradient-to-r from-itutor-green/50 to-transparent"></div>
              )}

              <div className="bg-itutor-card border border-gray-800 rounded-2xl p-6 hover:border-itutor-green transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-itutor-green/20 h-full">
                {/* Step Number */}
                <div className={`inline-block px-4 py-1 rounded-full bg-gradient-to-r ${step.color} text-white font-bold text-sm mb-4`}>
                  {step.number}
                </div>

                {/* Icon */}
                <div className="text-6xl mb-4 group-hover:scale-110 transition-transform duration-300">
                  {step.icon}
                </div>

                {/* Content */}
                <h3 className="text-2xl font-bold text-itutor-white mb-3 group-hover:text-itutor-green transition-colors">
                  {step.title}
                </h3>
                <p className="text-itutor-muted leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <a
            href="/signup"
            className="inline-block px-10 py-4 bg-gradient-to-r from-itutor-green to-emerald-500 text-itutor-black font-bold rounded-xl hover:shadow-lg hover:shadow-itutor-green/50 hover:scale-105 transition-all duration-300"
          >
            Start Learning Today
          </a>
        </div>
      </div>
    </section>
  );
}


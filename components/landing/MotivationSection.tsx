export default function MotivationSection() {
  return (
    <section className="relative bg-gradient-to-b from-itutor-black via-itutor-card to-itutor-black py-20 sm:py-28 overflow-hidden">
      {/* Topography Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='199' viewBox='0 0 100 199'%3E%3Cg fill='%2310B981' fill-opacity='0.4'%3E%3Cpath d='M0 199V0h1v1.99L100 199h-1.12L1 4.22V199H0zM100 2h-.12l-1-2H100v2z'%3E%3C/path%3E%3C/g%3E%3C/svg%3E")`,
        }}></div>
      </div>
      
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-itutor-green/10 rounded-full blur-3xl"></div>
      </div>
      
      {/* Diagonal Lines */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(45deg, #10B981 0, #10B981 1px, transparent 0, transparent 50%)`,
          backgroundSize: '10px 10px'
        }}></div>
      </div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8 flex justify-center">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-itutor-green to-emerald-500 flex items-center justify-center shadow-2xl shadow-itutor-green/50 animate-pulse">
              <svg
                className="w-12 h-12 text-itutor-black"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-itutor-white mb-6 leading-tight">
            Your Success{' '}
            <span className="text-transparent bg-gradient-to-r from-itutor-green to-emerald-400 bg-clip-text">
              Starts Here
            </span>
          </h2>
          <p className="text-lg sm:text-xl lg:text-2xl text-itutor-muted leading-relaxed max-w-3xl mx-auto mb-8">
            Join Caribbean students achieving their academic goals with personalized tutoring.
          </p>
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-itutor-green to-emerald-500 text-itutor-black font-bold rounded-xl hover:shadow-lg hover:shadow-itutor-green/50 hover:scale-105 transition-all duration-300"
            >
              <span>Join Now</span>
              <span>→</span>
            </a>
            <a
              href="/search"
              className="inline-flex items-center gap-2 px-8 py-4 border-2 border-itutor-green text-itutor-green font-semibold rounded-xl hover:bg-itutor-green hover:text-itutor-black transition-all duration-300"
            >
              <span>Browse iTutors</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}


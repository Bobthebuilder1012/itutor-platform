import Link from 'next/link';

export default function Hero() {
  return (
    <section className="relative bg-gradient-to-b from-itutor-black via-itutor-black to-itutor-card pt-44 pb-20 sm:pt-52 md:pt-60 lg:pt-64 sm:pb-28 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10 overflow-hidden">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2310B981' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}></div>
      </div>
      
      {/* Gradient Overlays - Constrained for mobile */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-0 sm:-left-20 w-64 sm:w-96 h-64 sm:h-96 bg-itutor-green/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-0 sm:-right-20 w-64 sm:w-96 h-64 sm:h-96 bg-itutor-green/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] sm:w-[400px] lg:w-[500px] h-[280px] sm:h-[400px] lg:h-[500px] bg-itutor-green/5 rounded-full blur-3xl"></div>
      </div>
      
      {/* Hexagon Pattern Overlay */}
      <div className="absolute inset-0 opacity-5 overflow-hidden">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='28' height='49' viewBox='0 0 28 49' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%2310B981' fill-opacity='1'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '56px'
        }}></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-block px-6 py-2 bg-itutor-green/20 border border-itutor-green/30 rounded-full text-itutor-green font-semibold mb-6 animate-pulse">
            #1 Caribbean Tutoring Platform
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-itutor-white mb-6 leading-tight bg-clip-text">
            Master CSEC & CAPE with{' '}
            <span className="text-transparent bg-gradient-to-r from-itutor-green to-emerald-400 bg-clip-text">
              Expert Caribbean iTutors
            </span>
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl text-itutor-muted mb-10 max-w-2xl mx-auto leading-relaxed">
            Get personalized, exam-focused tutoring from trusted educators who understand the Caribbean curriculum.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-itutor-green to-emerald-500 text-itutor-black font-bold rounded-xl hover:shadow-lg hover:shadow-itutor-green/50 hover:scale-105 transition-all duration-300 text-center"
            >
              Get Started Free
            </Link>
            <Link
              href="/signup"
              className="w-full sm:w-auto px-8 py-4 border-2 border-itutor-white/30 bg-itutor-white/5 backdrop-blur-sm text-itutor-white font-semibold rounded-xl hover:border-itutor-green hover:bg-itutor-green/10 hover:scale-105 transition-all duration-300 text-center"
            >
              Learn More
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-itutor-muted text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Verified iTutors</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span>4.8/5 Average Rating</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
              </svg>
              <span>92% Pass Rate</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


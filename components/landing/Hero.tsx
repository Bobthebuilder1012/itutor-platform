import Link from 'next/link';

export default function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-white via-green-50 to-emerald-50 pt-44 pb-20 sm:pt-52 md:pt-60 lg:pt-64 sm:pb-28 overflow-hidden">
      {/* Bright Gradient Overlays - Constrained for mobile */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-0 sm:-left-20 w-64 sm:w-96 h-64 sm:h-96 bg-gradient-to-br from-itutor-green/30 to-emerald-400/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-0 sm:-right-20 w-64 sm:w-96 h-64 sm:h-96 bg-gradient-to-br from-emerald-400/30 to-green-300/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] sm:w-[500px] lg:w-[600px] h-[280px] sm:h-[500px] lg:h-[600px] bg-gradient-to-br from-itutor-green/10 to-emerald-200/10 rounded-full blur-3xl"></div>
      </div>
      
      {/* Decorative Pattern */}
      <div className="absolute inset-0 opacity-[0.03] overflow-hidden">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2310B981' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-block px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-500 rounded-full text-white font-bold mb-6 shadow-lg shadow-itutor-green/30 animate-pulse">
            🎓 Caribbean Tutoring Platform
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            Master CSEC & CAPE with{' '}
            <span className="text-transparent bg-gradient-to-r from-itutor-green via-emerald-500 to-green-600 bg-clip-text">
              Expert Caribbean iTutors
            </span>
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl text-gray-700 mb-10 max-w-2xl mx-auto leading-relaxed font-medium">
            Get personalized, exam-focused tutoring from trusted educators who understand the Caribbean curriculum.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-itutor-green to-emerald-500 text-white font-bold rounded-xl shadow-xl shadow-itutor-green/40 hover:shadow-2xl hover:shadow-itutor-green/50 hover:scale-105 transition-all duration-300 text-center text-lg"
            >
              Get Started Free
            </Link>
            <Link
              href="/search"
              className="w-full sm:w-auto px-10 py-5 border-2 border-itutor-green bg-white text-itutor-green font-bold rounded-xl hover:bg-green-50 hover:scale-105 transition-all duration-300 text-center text-lg shadow-lg"
            >
              Browse Tutors
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-gray-700 text-base font-medium">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-md">
              <svg className="w-6 h-6 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Verified iTutors</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-md">
              <svg className="w-6 h-6 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>CSEC & CAPE Focused</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-md">
              <svg className="w-6 h-6 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Caribbean Curriculum</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

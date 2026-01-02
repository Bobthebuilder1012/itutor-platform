import Link from 'next/link';

export default function TutorBanner() {
  return (
    <section className="relative py-20 sm:py-24 overflow-hidden">
      {/* Geometric Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-itutor-green via-emerald-500 to-teal-400">
        <div className="absolute inset-0 opacity-20">
          {/* Triangle Pattern */}
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="triangles" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                <polygon points="0,0 50,0 25,43" fill="rgba(0,0,0,0.1)" />
                <polygon points="50,0 100,0 75,43" fill="rgba(255,255,255,0.1)" />
                <polygon points="25,43 75,43 50,86" fill="rgba(0,0,0,0.1)" />
                <polygon points="0,0 25,43 0,86" fill="rgba(255,255,255,0.05)" />
                <polygon points="75,43 100,0 100,86" fill="rgba(0,0,0,0.05)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#triangles)" />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-itutor-black mb-4">
            Become an iTutor
          </h2>
          <p className="text-lg sm:text-xl text-itutor-black/80 mb-8 max-w-2xl mx-auto">
            We're always looking for talented iTutors. Set your own rate, get paid, and make a difference in students' lives.
          </p>
          <Link
            href="/signup/tutor"
            className="inline-block px-10 py-4 bg-itutor-black text-itutor-white font-bold rounded-xl hover:bg-itutor-black/90 hover:scale-105 hover:shadow-2xl transition-all duration-300"
          >
            Apply Now
          </Link>
        </div>
      </div>
    </section>
  );
}


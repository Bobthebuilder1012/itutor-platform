import PublicPageHeader from '@/components/PublicPageHeader';
import Footer from '@/components/landing/Footer';

export default function AboutPage() {
  return (
    <div className="relative min-h-screen bg-white">
      <PublicPageHeader />
      
      <main>
        {/* Hero Section */}
        <section className="relative h-[400px] sm:h-[500px] overflow-hidden">
          {/* Background Image - Caribbean students in classroom */}
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-500">
            <div className="absolute inset-0" style={{
              backgroundImage: 'url("https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=1600&q=80")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.3
            }}></div>
          </div>

          {/* Content Overlay */}
          <div className="relative h-full flex items-center">
            <div className="container mx-auto px-6 sm:px-8 lg:px-12">
              <div className="max-w-2xl">
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight text-white">
                  About us
                </h1>
                <p className="text-xl sm:text-2xl text-white/90 leading-relaxed font-medium">
                  Education is freedom
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Mission Statement */}
        <section className="py-16 sm:py-20 lg:py-24 bg-white">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="max-w-4xl">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-8 leading-tight">
                We reimagine Caribbean education for the better
              </h2>
              <p className="text-lg sm:text-xl text-gray-600 leading-relaxed mb-6">
                Education opens doors. It creates options. It gives people the freedom to choose their future. But that freedom depends on access to the right support — and too often, that support is difficult to find.
              </p>
              <p className="text-lg sm:text-xl text-gray-600 leading-relaxed">
                iTutor is a Caribbean-built education platform designed to make academic support easier to access, easier to manage, and easier to trust — for parents, students, and iTutors alike.
              </p>
            </div>
          </div>
        </section>

        {/* Full-width Image Section - Student studying/learning challenges */}
        <section className="relative h-[400px] sm:h-[500px] overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute inset-0" style={{
              backgroundImage: 'url("https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1600&q=80")',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}></div>
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-black/30"></div>
          </div>
          
          <div className="relative h-full flex items-center">
            <div className="container mx-auto px-6 sm:px-8 lg:px-12">
              <div className="max-w-2xl">
                <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6 leading-tight">
                  The Problem We're Solving
                </h2>
                <p className="text-lg sm:text-xl text-white/90 leading-relaxed">
                  Across the Caribbean, tutoring is essential—yet the process of finding and managing it hasn't evolved. iTutor exists because this system doesn't work well, and it doesn't have to stay that way.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Problem Details */}
        <section className="py-16 sm:py-20 lg:py-24 bg-gray-50">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl">
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">For Parents</h3>
                <p className="text-gray-600 leading-relaxed">
                  Parents struggle to find available, reliable iTutors and are often left out of the loop once tutoring starts.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">For Students</h3>
                <p className="text-gray-600 leading-relaxed">
                  Students wait too long for help or receive inconsistent support when they need it most.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">For iTutors</h3>
                <p className="text-gray-600 leading-relaxed">
                  iTutors rely on word-of-mouth and informal networks, limiting their reach and professional growth.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 sm:py-20 lg:py-24 bg-white">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="max-w-4xl">
              <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-8 leading-tight">
                How iTutor Works
              </h2>
              <p className="text-lg sm:text-xl text-gray-600 leading-relaxed mb-12">
                iTutor is a platform that brings discovery, learning, and oversight into one place—connecting parents who want clarity, students who need support, and iTutors who want to teach professionally.
              </p>
              
              <div className="space-y-8">
                <div className="flex gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Parents</h3>
                    <p className="text-gray-600 leading-relaxed">
                      Find iTutors by subject and level, approve sessions, and monitor progress with clear insights into learning activity.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Students</h3>
                    <p className="text-gray-600 leading-relaxed">
                      Receive consistent, structured support tailored to their needs from iTutors who understand their academic level.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-gradient-to-br from-itutor-green to-emerald-500 rounded-lg flex items-center justify-center">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">iTutors</h3>
                    <p className="text-gray-600 leading-relaxed">
                      Manage availability, set rates, choose students, and teach independently—without being employed or micromanaged.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* Built for Everyone - Collaborative learning */}
        <section className="relative h-[400px] sm:h-[500px] overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute inset-0" style={{
              backgroundImage: 'url("https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1600&q=80")',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}></div>
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/80 to-blue-900/50"></div>
          </div>
          
          <div className="relative h-full flex items-center">
            <div className="container mx-auto px-6 sm:px-8 lg:px-12">
              <div className="max-w-2xl">
                <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6 leading-tight">
                  Built for Everyone
                </h2>
                <p className="text-lg sm:text-xl text-white/90 leading-relaxed">
                  iTutor is intentionally designed for every person in the learning journey—parents, students, and iTutors.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Built for Everyone - Details */}
        <section className="py-16 sm:py-20 lg:py-24 bg-white">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="max-w-5xl">
              {/* Built for Parents */}
              <div className="mb-16">
                <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                  Built for Parents
                </h3>
                <p className="text-lg text-gray-600 leading-relaxed mb-6">
                  Parents care deeply about their child's education—but they shouldn't have to chase updates or make blind decisions.
                </p>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Easy access to iTutors</h4>
                    <p className="text-gray-600">Find iTutors by subject, level, and availability</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Full control</h4>
                    <p className="text-gray-600">Approve sessions, manage payments and scheduling</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Clear insights</h4>
                    <p className="text-gray-600">View session history and learning activity</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Progress tracking</h4>
                    <p className="text-gray-600">Analytics showing consistency and engagement</p>
                  </div>
                </div>
              </div>

              {/* Built for Students */}
              <div className="mb-16">
                <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                  Built for Students
                </h3>
                <p className="text-lg text-gray-600 leading-relaxed mb-6">
                  Students need support that builds confidence, not pressure. iTutor removes logistical barriers so students can focus on learning, improvement, and confidence.
                </p>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Timely help</h4>
                    <p className="text-gray-600">Get support when needed—not weeks later</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Right fit</h4>
                    <p className="text-gray-600">Learn with iTutors who understand your level</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Build momentum</h4>
                    <p className="text-gray-600">Create consistency in your studies</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Supportive, not controlling</h4>
                    <p className="text-gray-600">Learn independently with guidance</p>
                  </div>
                </div>
              </div>

              {/* Built for Tutors */}
              <div className="mb-16">
                <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                  Built for iTutors
                </h3>
                <p className="text-lg text-gray-600 leading-relaxed mb-6">
                  iTutors are not employees—they are professionals. iTutor is built to respect that, providing the platform, structure, and trust while iTutors bring the expertise.
                </p>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Set your own terms</h4>
                    <p className="text-gray-600">Control your rates and availability</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Choose your students</h4>
                    <p className="text-gray-600">Decide who you want to teach</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Teach independently</h4>
                    <p className="text-gray-600">Work on your own terms without micromanagement</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Reach more families</h4>
                    <p className="text-gray-600">Connect with families actively seeking support</p>
                  </div>
                </div>
              </div>

              {/* Built for the Caribbean */}
              <div>
                <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                  Built for the Caribbean
                </h3>
                <p className="text-lg text-gray-600 leading-relaxed">
                  iTutor is not an imported solution adapted to local use. It is built specifically for Caribbean students, parents, and schools. We understand local education systems, exam pathways, and expectations because we live them. That understanding shapes every feature we build.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why Education Is Freedom */}
        <section className="py-16 sm:py-20 lg:py-24 bg-gray-50">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="max-w-4xl">
              <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-8 leading-tight">
                Why Education Is Freedom
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                When students get the right support, they gain confidence. When parents have visibility, they gain peace of mind. When iTutors have access and autonomy, they can teach effectively.
              </p>
              <p className="text-xl sm:text-2xl font-semibold text-gray-900 leading-relaxed">
                Education becomes more than grades—it becomes opportunity. That is why iTutor exists.
              </p>
            </div>
          </div>
        </section>

        {/* Our Vision - Educational success and achievement */}
        <section className="relative h-[500px] sm:h-[600px] overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute inset-0" style={{
              backgroundImage: 'url("https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&q=80")',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}></div>
            <div className="absolute inset-0 bg-gradient-to-r from-gray-900/90 to-gray-900/60"></div>
          </div>
          
          <div className="relative h-full flex items-center">
            <div className="container mx-auto px-6 sm:px-8 lg:px-12">
              <div className="max-w-3xl">
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-8 leading-tight">
                  Our Vision
                </h2>
                <div className="space-y-6 text-lg sm:text-xl text-white/90 leading-relaxed">
                  <p>
                    No parent should struggle to find academic support. No student should fall behind due to lack of access. No iTutor should be limited by outdated systems.
                  </p>
                  <p className="text-xl sm:text-2xl font-semibold text-white">
                    Our vision is a Caribbean where education works better for everyone—supported by technology that connects people, builds trust, and creates opportunity.
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-white">
                    That is the future iTutor is building.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="bg-gray-50 border-t border-gray-200">
        <Footer />
      </div>
    </div>
  );
}


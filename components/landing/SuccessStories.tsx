export default function SuccessStories() {
  const stories = [
    {
      name: "Sarah M.",
      grade: "Grade II in CSEC Math",
      subject: "Mathematics",
      quote: "My iTutor helped me go from struggling to getting a Grade II! The personalized approach made all the difference.",
      avatar: "👩‍🎓",
      color: "from-pink-500 to-rose-500"
    },
    {
      name: "Marcus T.",
      grade: "4 Unit 1 Distinctions",
      subject: "CAPE Sciences",
      quote: "Having an iTutor who understood the CAPE syllabus inside-out was a game changer. Highly recommend!",
      avatar: "👨‍🎓",
      color: "from-blue-500 to-indigo-500"
    },
    {
      name: "Keisha L.",
      grade: "Grade I in English",
      subject: "English Language",
      quote: "The flexibility and quality of tutoring exceeded my expectations. My confidence soared!",
      avatar: "👩‍🎓",
      color: "from-purple-500 to-violet-500"
    }
  ];

  return (
    <section className="relative bg-white py-20 sm:py-28 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%2310B981' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
        }}></div>
      </div>
      
      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-itutor-green via-emerald-400 to-itutor-green"></div>
      
      {/* Geometric Shapes */}
      <div className="absolute top-20 right-10 w-32 h-32 bg-gradient-to-br from-itutor-green/10 to-emerald-500/10 rounded-3xl rotate-12 blur-2xl"></div>
      <div className="absolute bottom-32 left-10 w-40 h-40 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-2xl"></div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-block px-6 py-2 bg-itutor-green/10 rounded-full text-itutor-green font-semibold mb-4">
            ⭐ Success Stories
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-itutor-black mb-6">
            Real Students.{' '}
            <span className="text-transparent bg-gradient-to-r from-itutor-green to-emerald-600 bg-clip-text">
              Real Results.
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Join hundreds of Caribbean students who've transformed their grades with iTutor
          </p>
        </div>

        {/* Stories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {stories.map((story, index) => (
            <div
              key={index}
              className="bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-itutor-green hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden"
            >
              {/* Gradient Background on Hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${story.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
              
              <div className="relative z-10">
                {/* Avatar & Info */}
                <div className="flex items-center mb-6">
                  <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${story.color} flex items-center justify-center text-3xl shadow-lg`}>
                    {story.avatar}
                  </div>
                  <div className="ml-4">
                    <h3 className="font-bold text-lg text-itutor-black">{story.name}</h3>
                    <p className="text-sm text-itutor-green font-semibold">{story.subject}</p>
                  </div>
                </div>

                {/* Quote */}
                <p className="text-gray-700 italic mb-4 leading-relaxed">
                  "{story.quote}"
                </p>

                {/* Grade Badge */}
                <div className={`inline-block px-4 py-2 rounded-lg bg-gradient-to-r ${story.color} text-white font-bold text-sm shadow-md`}>
                  🎉 {story.grade}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
          {[
            { number: "500+", label: "Active Students", icon: "👥" },
            { number: "150+", label: "Verified iTutors", icon: "✅" },
            { number: "92%", label: "Pass Rate", icon: "📈" },
            { number: "4.8/5", label: "Avg Rating", icon: "⭐" }
          ].map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-4xl mb-2">{stat.icon}</div>
              <div className="text-3xl font-bold text-itutor-black mb-1">{stat.number}</div>
              <div className="text-gray-600 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


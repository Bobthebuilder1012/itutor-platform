'use client';

import { useState } from 'react';

const featuredTutors = [
  {
    id: 1,
    title: 'CSEC Mathematics Excellence',
    badge: 'Top Rated',
    image: '/assets/placeholders/math.jpg',
    sessions: '2,000+',
  },
  {
    id: 2,
    title: 'CAPE Chemistry Mastery',
    badge: 'Popular',
    image: '/assets/placeholders/chemistry.jpg',
    sessions: '1,500+',
  },
  {
    id: 3,
    title: 'CAPE English A Support',
    badge: 'Top Rated',
    image: '/assets/placeholders/english.jpg',
    sessions: '1,800+',
  },
  {
    id: 4,
    title: 'CSEC Biology Expert',
    badge: 'Popular',
    image: '/assets/placeholders/biology.jpg',
    sessions: '1,200+',
  },
  {
    id: 5,
    title: 'CAPE Physics Tutor',
    badge: 'Top Rated',
    image: '/assets/placeholders/physics.jpg',
    sessions: '1,600+',
  },
  {
    id: 6,
    title: 'CSEC Spanish Mastery',
    badge: 'Popular',
    image: '/assets/placeholders/spanish.jpg',
    sessions: '1,400+',
  },
  {
    id: 7,
    title: 'CAPE Accounting Expert',
    badge: 'Top Rated',
    image: '/assets/placeholders/accounting.jpg',
    sessions: '1,900+',
  },
  {
    id: 8,
    title: 'CSEC Social Studies Pro',
    badge: 'Popular',
    image: '/assets/placeholders/social.jpg',
    sessions: '1,300+',
  },
  {
    id: 9,
    title: 'CAPE Economics Specialist',
    badge: 'Top Rated',
    image: '/assets/placeholders/economics.jpg',
    sessions: '1,700+',
  },
  {
    id: 10,
    title: 'CSEC Integrated Science',
    badge: 'Popular',
    image: '/assets/placeholders/science.jpg',
    sessions: '2,100+',
  },
];

export default function FeaturedCarousel() {
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 3;
  const totalPages = Math.ceil(featuredTutors.length / itemsPerPage);

  return (
    <section className="bg-itutor-black py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-bold text-itutor-white mb-10 text-center">
          Featured Tutors & Subjects
        </h2>

        <div className="relative overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-6 pb-4">
              {featuredTutors.map((tutor) => (
                <div
                  key={tutor.id}
                  className="flex-none w-72 sm:w-80 bg-gradient-to-br from-itutor-card to-itutor-black border border-itutor-border rounded-2xl overflow-hidden hover:border-itutor-green hover:shadow-xl hover:shadow-itutor-green/20 hover:-translate-y-2 transition-all duration-300 group"
                >
                  <div className="relative h-48 bg-gradient-to-br from-itutor-border/50 to-itutor-card flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-itutor-green/5 group-hover:bg-itutor-green/10 transition-colors"></div>
                    <div className="absolute top-4 right-4 z-10">
                      <span className="px-3 py-1 bg-gradient-to-r from-itutor-green to-emerald-500 text-itutor-black text-xs font-bold rounded-full shadow-lg">
                        {tutor.badge}
                      </span>
                    </div>
                    <div className="text-6xl opacity-30 group-hover:opacity-40 group-hover:scale-110 transition-all duration-300">📚</div>
                  </div>
                  <div className="p-6 bg-gradient-to-br from-itutor-card/50 to-transparent">
                    <h3 className="text-xl font-bold text-itutor-white mb-2 group-hover:text-itutor-green transition-colors">
                      {tutor.title}
                    </h3>
                    <p className="text-itutor-muted text-sm flex items-center gap-2">
                      <span className="w-2 h-2 bg-itutor-green rounded-full"></span>
                      {tutor.sessions} sessions completed
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentPage(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                currentPage === index
                  ? 'bg-itutor-green w-8'
                  : 'bg-itutor-border hover:bg-itutor-muted'
              }`}
              aria-label={`Go to page ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}


'use client';

import Link from 'next/link';

export default function FooterLinks() {
  const categories = [
    {
      title: 'CSEC Subjects',
      links: [
        'Mathematics',
        'English A',
        'Biology',
        'Chemistry',
        'Physics',
        'Spanish',
        'Social Studies',
        'Integrated Science',
      ],
    },
    {
      title: 'CAPE Subjects',
      links: [
        'Pure Mathematics',
        'Applied Mathematics',
        'Biology',
        'Chemistry',
        'Physics',
        'Economics',
        'Accounting',
        'English Literature',
      ],
    },
    {
      title: 'Exam Preparation',
      links: [
        'CSEC Past Papers',
        'CAPE Past Papers',
        'SBA Help',
        'Exam Strategies',
        'Study Skills',
        'Time Management',
      ],
    },
    {
      title: 'Popular Topics',
      links: [
        'Math Tutoring',
        'Science Tutoring',
        'Essay Writing',
        'Lab Reports',
        'Exam Prep Sessions',
        'Group Study',
      ],
    },
  ];

  return (
    <section className="bg-itutor-white py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-itutor-black mb-8">
          Everything We Offer
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {categories.map((category, index) => (
            <div key={index}>
              <h3 className="font-semibold text-itutor-black mb-4">
                {category.title}
              </h3>
              <ul className="space-y-2">
                {category.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <Link
                      href="#"
                      className="text-sm text-itutor-muted hover:text-itutor-green transition-colors"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
                <li>
                  <button
                    onClick={(e) => e.preventDefault()}
                    className="text-sm text-itutor-green hover:text-itutor-green/80 transition-colors font-medium cursor-default"
                  >
                    More...
                  </button>
                </li>
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


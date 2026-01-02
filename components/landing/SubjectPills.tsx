'use client';

import { useState } from 'react';

const subjects = [
  'CSEC',
  'CAPE',
  'Math',
  'Chemistry',
  'Biology',
  'English A',
  'SBA Help',
  'Physics',
  'Spanish',
];

export default function SubjectPills() {
  const [activeSubject, setActiveSubject] = useState('CSEC');

  return (
    <section className="bg-itutor-black py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-itutor-white mb-8 text-center">
          Explore by Subject
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {subjects.map((subject) => (
            <button
              key={subject}
              onClick={() => setActiveSubject(subject)}
              className={`px-6 py-3 rounded-full font-semibold transition-all duration-300 ${
                activeSubject === subject
                  ? 'bg-gradient-to-r from-itutor-green to-emerald-500 text-itutor-black shadow-lg shadow-itutor-green/50 scale-105'
                  : 'bg-itutor-card/50 border-2 border-itutor-border text-itutor-white hover:border-itutor-green hover:text-itutor-green hover:shadow-lg hover:shadow-itutor-green/20 hover:scale-105'
              }`}
            >
              {subject}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}


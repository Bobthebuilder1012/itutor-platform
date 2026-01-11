'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import TutorCard from './TutorCard';
import type { FeaturedTutor } from '@/lib/services/landingTutorsService';

interface FeaturedTutorsProps {
  tutors: FeaturedTutor[];
}

const filters = [
  { id: 'all', label: 'All Subjects' },
  { id: 'CSEC', label: 'CSEC' },
  { id: 'CAPE', label: 'CAPE' },
  { id: 'Math', label: 'Mathematics' },
  { id: 'Science', label: 'Science' },
  { id: 'English', label: 'English' },
];

export default function FeaturedTutors({ tutors }: FeaturedTutorsProps) {
  const [activeFilter, setActiveFilter] = useState('all');

  // Filter tutors based on selected filter
  const filteredTutors = useMemo(() => {
    if (activeFilter === 'all') {
      return tutors;
    }

    return tutors.filter((tutor) => {
      // Check if tutor teaches this curriculum
      if (activeFilter === 'CSEC' || activeFilter === 'CAPE') {
        return tutor.subjects.some((s) => s.curriculum === activeFilter);
      }

      // Check if tutor teaches this subject (case-insensitive partial match)
      return tutor.subjects.some((s) =>
        s.name.toLowerCase().includes(activeFilter.toLowerCase())
      );
    });
  }, [tutors, activeFilter]);

  // Empty state
  if (tutors.length === 0) {
    return (
      <section className="relative bg-green-50 py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-3">
              Top Caribbean iTutors
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              No iTutors available yet. Be the first to join our platform!
            </p>
            <Link
              href="/signup/tutor"
              className="inline-block px-8 py-4 bg-gradient-to-r from-itutor-green to-emerald-500 text-white font-bold rounded-xl hover:shadow-xl hover:scale-105 transition-all duration-300"
            >
              Become a Tutor
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative bg-green-50 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-3">
            Top Caribbean iTutors
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            Verified iTutors, clear pricing, exam-focused help.
          </p>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-5 py-2.5 rounded-full font-semibold transition-all duration-300 ${
                activeFilter === filter.id
                  ? 'bg-itutor-green text-white shadow-lg shadow-itutor-green/30'
                  : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-itutor-green hover:text-itutor-green'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Horizontal Scrolling Tutors */}
        {filteredTutors.length > 0 ? (
          <div className="relative">
            <div className="overflow-x-auto scrollbar-hide pb-4 scroll-smooth">
              <div className="flex gap-6 min-w-min px-1">
                {filteredTutors.map((tutor) => (
                  <div key={tutor.id} className="w-80 flex-shrink-0">
                    <TutorCard tutor={tutor} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-xl text-gray-600 mb-4">
              No iTutors found for this filter.
            </p>
            <button
              onClick={() => setActiveFilter('all')}
              className="text-itutor-green font-semibold hover:underline"
            >
              View all iTutors
            </button>
          </div>
        )}

        {/* Browse More CTA */}
        <div className="text-center mt-8">
          <Link
            href="/search"
            className="inline-block px-8 py-4 bg-white text-itutor-green font-bold rounded-xl border-2 border-itutor-green hover:bg-green-50 hover:scale-105 transition-all duration-300 shadow-lg"
          >
            Browse All iTutors
          </Link>
        </div>
      </div>
    </section>
  );
}


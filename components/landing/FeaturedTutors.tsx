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
      <section className="bg-gradient-to-b from-white to-gray-50 py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Top Caribbean Tutors
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              No tutors available yet. Be the first to join our platform!
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
    <section className="bg-gradient-to-b from-white to-gray-50 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Top Caribbean Tutors
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            Verified tutors, clear pricing, exam-focused help.
          </p>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
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

        {/* Tutors Grid */}
        {filteredTutors.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredTutors.map((tutor) => (
              <TutorCard key={tutor.id} tutor={tutor} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-xl text-gray-600 mb-4">
              No tutors found for this filter.
            </p>
            <button
              onClick={() => setActiveFilter('all')}
              className="text-itutor-green font-semibold hover:underline"
            >
              View all tutors
            </button>
          </div>
        )}

        {/* Browse More CTA */}
        {filteredTutors.length >= 8 && (
          <div className="text-center mt-12">
            <Link
              href="/search"
              className="inline-block px-8 py-4 bg-white text-itutor-green font-bold rounded-xl border-2 border-itutor-green hover:bg-green-50 hover:scale-105 transition-all duration-300 shadow-lg"
            >
              Browse All Tutors
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}


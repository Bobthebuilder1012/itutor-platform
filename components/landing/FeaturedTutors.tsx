'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import TutorCard from './TutorCard';
import type { FeaturedTutor } from '@/lib/services/landingTutorsService';

interface FeaturedTutorsProps {
  tutors: FeaturedTutor[];
  paidClassesEnabled?: boolean;
}

const MAX_FEATURED = 5;

const filters = [
  { id: 'all', label: 'All Subjects' },
  { id: 'CSEC', label: 'CSEC' },
  { id: 'CAPE', label: 'CAPE' },
  { id: 'Math', label: 'Mathematics' },
  { id: 'Science', label: 'Science' },
  { id: 'English', label: 'English' },
];

export default function FeaturedTutors({ tutors, paidClassesEnabled = false }: FeaturedTutorsProps) {
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredTutors = useMemo(() => {
    if (activeFilter === 'all') {
      return tutors;
    }

    return tutors.filter((tutor) => {
      if (activeFilter === 'CSEC' || activeFilter === 'CAPE') {
        return tutor.subjects.some((s) => s.curriculum === activeFilter);
      }

      return tutor.subjects.some((s) =>
        s.name.toLowerCase().includes(activeFilter.toLowerCase())
      );
    });
  }, [tutors, activeFilter]);

  const visibleTutors = useMemo(
    () => filteredTutors.slice(0, MAX_FEATURED),
    [filteredTutors]
  );

  if (tutors.length === 0) {
    return (
      <section className="relative bg-transparent py-20 sm:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-3 text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
              Top Caribbean iTutors
            </h2>
            <p className="mb-6 text-lg text-gray-600">
              No iTutors available yet. Be the first to join our platform!
            </p>
            <Link
              href="/signup/tutor"
              className="inline-block rounded-xl bg-gradient-to-r from-itutor-green to-emerald-500 px-8 py-4 font-bold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl"
            >
              Become a Tutor
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative w-full bg-transparent py-20 sm:py-28">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
            Top Caribbean iTutors
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-gray-600 sm:text-xl">
            Verified iTutors, clear pricing, exam-focused help.
          </p>
        </div>

        <div className="mb-8 flex flex-wrap justify-center gap-3">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`rounded-full px-5 py-2.5 font-semibold ring-1 ring-inset backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 ${
                activeFilter === filter.id
                  ? 'border border-itutor-green/40 bg-itutor-green/10 text-itutor-green shadow-sm ring-itutor-green/20'
                  : 'border border-gray-200 bg-white/70 text-gray-700 ring-gray-100 hover:scale-[1.03] hover:border-itutor-green/30 hover:text-itutor-green'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {visibleTutors.length > 0 ? (
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="min-w-0 flex-1 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
              <div className="flex min-w-min items-stretch gap-2 sm:grid sm:min-w-0 sm:grid-cols-5 sm:items-stretch sm:gap-3">
                {visibleTutors.map((tutor) => (
                  <div
                    key={tutor.id}
                    className="flex h-full w-[44vw] max-w-[170px] flex-shrink-0 sm:w-auto sm:max-w-none"
                  >
                    <TutorCard tutor={tutor} showPrice={paidClassesEnabled} compact />
                  </div>
                ))}
              </div>
            </div>
            <Link
              href="/search"
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center self-center rounded-full border border-gray-200 bg-white/70 text-itutor-green shadow-sm backdrop-blur-md transition-all duration-300 hover:scale-[1.03] hover:border-itutor-green/40 hover:bg-white sm:h-14 sm:w-14"
              aria-label="View all iTutors"
            >
              <ChevronRightIcon className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2} />
            </Link>
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="mb-4 text-xl text-gray-600">No iTutors found for this filter.</p>
            <button
              onClick={() => setActiveFilter('all')}
              className="font-semibold text-itutor-green hover:underline"
            >
              View all iTutors
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

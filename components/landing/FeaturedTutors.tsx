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

const filterTabsStyle = {
  background: 'rgba(255,255,255,0.55)',
  boxShadow: '0 8px 32px rgba(22,163,74,0.08),0 2px 8px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.8)',
};

const activeTabStyle = {
  background: 'linear-gradient(135deg,#22c55e,#16a34a)',
  boxShadow: '0 4px 14px rgba(34,197,94,0.35),inset 0 1px 0 rgba(255,255,255,0.3)',
};

export default function FeaturedTutors({ tutors, paidClassesEnabled = false }: FeaturedTutorsProps) {
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredTutors = useMemo(() => {
    if (activeFilter === 'all') return tutors;
    return tutors.filter((tutor) => {
      if (activeFilter === 'CSEC' || activeFilter === 'CAPE') {
        return tutor.subjects.some((s) => s.curriculum === activeFilter);
      }
      return tutor.subjects.some((s) =>
        s.name.toLowerCase().includes(activeFilter.toLowerCase())
      );
    });
  }, [tutors, activeFilter]);

  const visibleTutors = useMemo(() => filteredTutors.slice(0, MAX_FEATURED), [filteredTutors]);

  if (tutors.length === 0) {
    return (
      <section className="relative bg-transparent py-20 sm:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2
              className="mb-3 font-bold text-[#052e1a]"
              style={{ fontSize: 'clamp(38px,5.5vw,64px)', letterSpacing: '-0.03em' }}
            >
              Top Caribbean{' '}
              <span className="bg-gradient-to-r from-[#16a34a] to-[#22c55e] bg-clip-text font-instrument italic text-transparent">
                iTutors
              </span>
            </h2>
            <p className="mb-6 text-lg text-[#4b5563]">
              No iTutors available yet. Be the first to join our platform!
            </p>
            <Link
              href="/signup"
              className="inline-block rounded-xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-8 py-4 font-bold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl"
            >
              Become a Tutor
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative w-full bg-transparent py-20 sm:py-28 2xl:py-40 3xl:py-52">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 3xl:px-16">
        <div className="mb-11 text-center 2xl:mb-16 3xl:mb-20">
          <h2
            className="mb-3 font-bold text-[#052e1a] 2xl:mb-5"
            style={{ fontSize: 'clamp(38px,5.5vw,64px)', letterSpacing: '-0.03em', lineHeight: '1.05' }}
          >
            Top Caribbean{' '}
            <span className="bg-gradient-to-r from-[#16a34a] to-[#22c55e] bg-clip-text font-instrument italic text-transparent">
              iTutors
            </span>
          </h2>
          <p className="mx-auto max-w-[600px] text-lg text-[#4b5563] sm:text-xl 2xl:text-2xl">
            Verified iTutors, clear pricing, exam-focused help.
          </p>
        </div>

        {/* Glass pill filter tabs */}
        <div className="mb-11 flex justify-center 2xl:mb-14">
          <div
            className="flex flex-wrap justify-center gap-2 rounded-full border border-white/60 p-2 backdrop-blur-[20px]"
            style={filterTabsStyle}
          >
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className="rounded-full px-[22px] py-2.5 text-sm font-medium font-body transition-all duration-200 2xl:text-base"
                style={activeFilter === filter.id ? activeTabStyle : undefined}
              >
                <span className={activeFilter === filter.id ? 'text-white' : 'text-[#374151] hover:text-[#374151]'}>
                  {filter.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {visibleTutors.length > 0 ? (
          <div className="flex items-center gap-2 sm:gap-4 2xl:gap-6 3xl:gap-8">
            <div className="min-w-0 flex-1 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
              <div className="flex min-w-min items-stretch gap-2 sm:grid sm:min-w-0 sm:grid-cols-5 sm:items-stretch sm:gap-3 2xl:gap-5 3xl:gap-7">
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
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center self-center rounded-full border border-white/60 text-[#16a34a] backdrop-blur-[14px] transition-all duration-300 hover:scale-[1.03] hover:border-white/80 sm:h-14 sm:w-14 2xl:h-16 2xl:w-16"
              style={{
                background: 'rgba(255,255,255,0.7)',
                boxShadow: '0 2px 8px rgba(22,163,74,0.08)',
              }}
              aria-label="View all iTutors"
            >
              <ChevronRightIcon className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2} />
            </Link>
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="mb-4 text-xl text-[#4b5563]">No iTutors found for this filter.</p>
            <button
              onClick={() => setActiveFilter('all')}
              className="font-semibold text-[#16a34a] hover:underline"
            >
              View all iTutors
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

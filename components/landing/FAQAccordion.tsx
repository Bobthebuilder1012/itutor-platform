'use client';

import { useState } from 'react';

export const landingFaqs = [
  {
    question: 'What is iTutor?',
    answer:
      'iTutor is a Caribbean-focused online tutoring platform connecting students with expert iTutors for CSEC and CAPE exam preparation. We provide personalized, curriculum-aligned support to help students achieve their academic goals.',
  },
  {
    question: 'Who are the iTutors?',
    answer:
      'Our iTutors are verified Caribbean educators with proven expertise in CSEC and CAPE curriculum. Each iTutor undergoes a thorough vetting process and has demonstrated success in helping students excel.',
  },
  {
    question: 'Is iTutor safe for students?',
    answer:
      'Yes, student safety is our priority. All iTutors are verified, sessions can be monitored by parents, and we maintain strict privacy and security standards to protect our students.',
  },
  {
    question: 'Is it aligned with CSEC/CAPE?',
    answer:
      'Absolutely. Our entire platform is designed specifically for the Caribbean curriculum. Our iTutors specialize in CSEC and CAPE subjects and understand the exam requirements inside and out.',
  },
  {
    question: 'How does booking work?',
    answer:
      'Simply create an account, browse available iTutors by subject, and book a session at a time that works for you. You can schedule sessions in advance or find immediate availability.',
  },
];

type FAQAccordionProps = {
  /** Compact layout for footer right column */
  embedded?: boolean;
};

export default function FAQAccordion({ embedded = false }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const list = (
    <div className={embedded ? '' : 'mx-auto max-w-4xl'}>
      {landingFaqs.map((faq, index) => (
        <div key={index} className="border-b border-itutor-border">
          <button
            type="button"
            onClick={() => toggleFAQ(index)}
            className={`group flex w-full items-center justify-between text-left ${embedded ? 'gap-2 py-3' : 'py-8'}`}
          >
            <span
              className={`pr-4 font-medium text-itutor-white transition-colors group-hover:text-itutor-green ${embedded ? 'text-sm leading-snug' : 'text-lg sm:text-xl'}`}
            >
              {faq.question}
            </span>
            <svg
              className={`h-4 w-4 flex-shrink-0 text-itutor-white transition-transform sm:h-5 sm:w-5 ${openIndex === index ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openIndex === index && (
            <div
              className={`text-itutor-muted leading-relaxed ${embedded ? 'pb-3 text-xs' : 'pb-8 text-base'}`}
            >
              {faq.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className="min-w-0">
        <h2 className="mb-4 text-left text-lg font-bold text-itutor-white sm:mb-5 sm:text-xl">
          Frequently Asked Questions
        </h2>
        {list}
      </div>
    );
  }

  return (
    <section className="bg-itutor-black py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="mb-12 text-center text-3xl font-bold text-itutor-white sm:text-4xl">
          Frequently Asked Questions
        </h2>
        {list}
      </div>
    </section>
  );
}

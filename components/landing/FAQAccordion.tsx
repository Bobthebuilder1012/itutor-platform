'use client';

import { useState } from 'react';

const faqs = [
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

export default function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="bg-itutor-black py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-bold text-itutor-white mb-12 text-center">
          Frequently Asked Questions
        </h2>

        <div className="max-w-4xl mx-auto">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border-b border-itutor-border"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full flex items-center justify-between py-8 text-left group"
              >
                <span className="text-lg sm:text-xl font-medium text-itutor-white pr-8 group-hover:text-itutor-green transition-colors">
                  {faq.question}
                </span>
                <svg
                  className={`w-6 h-6 flex-shrink-0 text-itutor-white transition-transform ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {openIndex === index && (
                <div className="pb-8 text-itutor-muted text-base leading-relaxed">{faq.answer}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


'use client';

import Link from 'next/link';
import PublicPageHeader from '@/components/PublicPageHeader';
import { useProfile } from '@/lib/hooks/useProfile';

export default function ITutorRequirementsPage() {
  const { profile, loading: profileLoading } = useProfile();
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <PublicPageHeader profile={profile} loading={profileLoading} />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-itutor-green via-emerald-500 to-teal-400 py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-itutor-black mb-6">
            Become an iTutor
          </h1>
          <p className="text-xl sm:text-2xl text-itutor-black/90 mb-8 max-w-3xl mx-auto">
            Teach what you know. Support students. Earn on your terms.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup/tutor"
              className="px-8 py-4 bg-itutor-black text-white font-bold rounded-xl hover:bg-gray-900 hover:scale-105 transition-all duration-300 shadow-lg"
            >
              Become an iTutor
            </Link>
            <a
              href="#verification"
              className="px-8 py-4 bg-white text-itutor-black font-semibold rounded-xl hover:bg-gray-100 hover:scale-105 transition-all duration-300 shadow-lg"
            >
              How Verification Works
            </a>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 max-w-5xl">
        
        {/* Eligibility Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Minimum Requirements</h2>
          <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-gray-100">
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-itutor-green flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700"><strong>Must be 16 years or older</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-itutor-green flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700"><strong>Reliable internet connection and device</strong> capable of video calls</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-itutor-green flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700"><strong>Strong knowledge in at least one subject</strong> you plan to teach</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-itutor-green flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700"><strong>Professional behavior</strong> — punctual, respectful, and prepared</span>
              </li>
            </ul>

            {/* Callout Box */}
            <div className="bg-green-50 border-2 border-itutor-green rounded-xl p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-6 h-6 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Good News!
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-itutor-green font-bold">✓</span>
                  <span>No teaching experience required</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-itutor-green font-bold">✓</span>
                  <span>You can be an iTutor while you're still a student</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-itutor-green font-bold">✓</span>
                  <span>You set your own hourly rates</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">How It Works</h2>
          <div className="space-y-4">
            {[
              { number: 1, title: "Create your iTutor account", desc: "Sign up with your details and complete your profile." },
              { number: 2, title: "Add subjects you teach and set your rate", desc: "Choose subjects you're confident teaching and set competitive rates." },
              { number: 3, title: "Receive booking requests", desc: "Students find you and request sessions based on your subjects." },
              { number: 4, title: "Confirm sessions and teach online", desc: "Accept requests, join video calls, and teach from anywhere." },
              { number: 5, title: "Receive payouts after completed sessions", desc: "Get paid automatically via bank transfer after each session." }
            ].map((step) => (
              <div key={step.number} className="bg-white rounded-xl shadow-md p-6 border-l-4 border-itutor-green hover:shadow-lg transition-shadow">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-itutor-green text-white rounded-full flex items-center justify-center font-bold text-lg">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">{step.title}</h3>
                    <p className="text-gray-600">{step.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Rates & Independence */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Independence & Control</h2>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-8 border-2 border-blue-200">
            <p className="text-gray-700 leading-relaxed mb-4">
              As an iTutor, <strong>you are an independent educator</strong>, not an employee. This means you have full control over your teaching practice:
            </p>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Set your own rates</strong> — Choose what you charge based on your expertise and market demand</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Control your availability</strong> — Teach when it suits your schedule</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Choose your requests</strong> — Accept or decline booking requests based on fit</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Build your reputation</strong> — Earn reviews and grow your student base</span>
              </li>
            </ul>
            <div className="mt-6 p-4 bg-white rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Platform commission:</strong> iTutor takes 10-20% commission (based on session price) to cover platform maintenance, payment processing, and support.
              </p>
            </div>
          </div>
        </section>

        {/* Verification Section */}
        <section id="verification" className="mb-16 scroll-mt-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Verification (Optional, After Signup)</h2>
          <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-purple-100">
            <div className="mb-6">
              <p className="text-gray-700 leading-relaxed mb-4">
                Verification is <strong>optional but highly recommended</strong>. It helps you stand out and build trust with students.
              </p>
              <div className="bg-purple-50 rounded-xl p-4 mb-4">
                <h3 className="font-bold text-gray-900 mb-2">After Approval, You'll Get:</h3>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600">✓</span>
                    <span><strong>Verified iTutor badge</strong> displayed on your profile</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600">✓</span>
                    <span><strong>Your verified subjects and grades</strong> shown publicly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600">✓</span>
                    <span><strong>Higher ranking</strong> in search results</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600">✓</span>
                    <span><strong>More booking requests</strong> from students</span>
                  </li>
                </ul>
              </div>
              <p className="text-gray-600 text-sm">
                <strong>Timeline:</strong> Verification review typically takes a few hours. You'll be notified once approved.
              </p>
            </div>
          </div>
        </section>

        {/* Professional Expectations */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Professional Expectations</h2>
          <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-gray-100">
            <p className="text-gray-700 leading-relaxed mb-4">
              To maintain a high-quality learning environment, all iTutors are expected to:
            </p>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-itutor-green flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>Communicate professionally</strong> — Respond promptly and courteously to messages</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-itutor-green flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>Be punctual</strong> — Join sessions on time and honor commitments</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-itutor-green flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>Be honest about your expertise</strong> — Only teach subjects you're qualified for</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-itutor-green flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>Maintain appropriate boundaries</strong> — Keep interactions professional and educational</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-itutor-green flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>Respect student privacy</strong> — Keep student information confidential</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Prohibited Conduct */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Prohibited Conduct</h2>
          <div className="bg-red-50 rounded-2xl shadow-lg p-8 border-2 border-red-200">
            <p className="text-gray-700 leading-relaxed mb-4">
              The following behaviors will result in immediate account suspension or removal:
            </p>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span><strong>Submitting fake or forged examination results</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span><strong>Harassment or inappropriate behavior</strong> toward students or staff</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span><strong>Pushing off-platform payments</strong> or attempting to bypass iTutor's payment system</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span><strong>Misuse of student data</strong> or sharing personal information</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span><strong>Fraudulent no-show claims</strong> or abuse of platform policies</span>
              </li>
            </ul>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              {
                q: "Do I need teaching experience?",
                a: "No. Teaching experience is not required. What matters is your knowledge of the subject and your ability to explain concepts clearly."
              },
              {
                q: "Can I be an iTutor as a student?",
                a: "Yes! If you're 15 or older and confident in a subject, you can become an iTutor while still being a student yourself."
              },
              {
                q: "Do I have to be verified?",
                a: "No, verification is optional and done after you create your account. However, it's recommended as it helps you attract more students."
              },
              {
                q: "Do I set my own rates?",
                a: "Yes. You have complete control over your hourly rates and can adjust them anytime."
              },
              {
                q: "When do I get paid?",
                a: "Payouts are processed automatically after each completed session, typically arriving in your bank account within 4-7 business days."
              },
              {
                q: "What if a student doesn't show up?",
                a: "If a student doesn't join within 33% of the session time, you can mark it as a no-show and receive 50% of the session fee."
              }
            ].map((faq, index) => (
              <details key={index} className="bg-white rounded-xl shadow-md p-6 border-2 border-gray-100 hover:border-itutor-green transition-colors group">
                <summary className="font-bold text-gray-900 cursor-pointer list-none flex items-center justify-between">
                  <span>{faq.q}</span>
                  <svg className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="mt-4 text-gray-600 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Contact Support */}
        <section className="text-center py-12 bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Have More Questions?</h2>
          <p className="text-gray-600 mb-6">
            Our support team is here to help you get started.
          </p>
          <a
            href="mailto:support@myitutor.com"
            className="inline-flex items-center gap-2 px-6 py-3 bg-itutor-green text-white font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            support@myitutor.com
          </a>
        </section>
      </div>

      {/* Footer */}
      <footer className="bg-itutor-black text-itutor-white py-8 mt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-itutor-muted">
            &copy; {new Date().getFullYear()} iTutor. All rights reserved.
          </p>
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <Link href="/terms" className="hover:text-itutor-green transition-colors">
              Terms & Conditions
            </Link>
            <Link href="/privacy" className="hover:text-itutor-green transition-colors">
              Privacy Policy
            </Link>
            <Link href="/help/itutors" className="hover:text-itutor-green transition-colors">
              Help Centre
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}


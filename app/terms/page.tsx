import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="relative min-h-screen bg-white">
      <Header />
      
      <main className="pt-32 pb-16">
        {/* Hero Section */}
        <section className="bg-gray-50 py-16 border-b border-gray-200">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="max-w-4xl">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-4">
                Terms and Conditions
              </h1>
              <p className="text-lg text-gray-600">
                Last updated: January 2025
              </p>
            </div>
          </div>
        </section>

        {/* Navigation Links */}
        <section className="py-8 bg-white border-b border-gray-200">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="max-w-4xl">
              <p className="text-sm text-gray-600 mb-3">Jump to section:</p>
              <div className="flex flex-wrap gap-4">
                <a href="#student" className="text-itutor-green hover:text-emerald-600 font-medium">
                  Student Terms
                </a>
                <span className="text-gray-300">|</span>
                <a href="#parent" className="text-itutor-green hover:text-emerald-600 font-medium">
                  Parent/Guardian Terms
                </a>
                <span className="text-gray-300">|</span>
                <a href="#tutor" className="text-itutor-green hover:text-emerald-600 font-medium">
                  iTutor Terms
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Student Terms */}
        <section id="student" className="py-16 bg-white border-b border-gray-200">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="max-w-4xl">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8">
                Student Terms and Conditions
              </h2>

              <div className="space-y-10">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">1. About iTutor</h3>
                  <p className="text-gray-700 leading-relaxed">
                    iTutor is an online platform that connects students with independent iTutors for educational sessions. iTutor does not provide tutoring services itself and is not responsible for the academic content delivered by iTutors.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">2. Eligibility</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Students must be at least 13 years old to use iTutor.</li>
                    <li>If you are under 18, your parent or guardian must approve your account and is responsible for payments.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">3. Booking Sessions</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Students may request or book sessions with iTutors based on availability.</li>
                    <li>Session duration, subject, and pricing are determined by the iTutor.</li>
                    <li>Sessions are conducted using third-party video platforms (e.g. Google Meet or Zoom).</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">4. Joining Sessions</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>A "Join Session" button becomes available shortly before the session start time.</li>
                    <li>If you do not join the session within the allowed waiting period, the iTutor may end the session.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">5. No-Show and Payment Policy</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>If a student does not join within 33% of the session duration, the iTutor may mark the session as a student no-show.</li>
                    <li>In this case, 50% of the session fee may be charged.</li>
                    <li>If the session proceeds normally, the full session fee is charged at the scheduled end time.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">6. Academic Results Disclaimer</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>iTutor does not guarantee academic improvement, grades, or exam results.</li>
                    <li>Tutors are independent and responsible for their own teaching methods.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">7. Conduct</h3>
                  <p className="text-gray-700 mb-2">Students must:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Be respectful to tutors</li>
                    <li>Not engage in harassment, cheating, or misuse of the platform</li>
                    <li>Not upload false or misleading information</li>
                  </ul>
                  <p className="text-gray-700 mt-2">Violations may result in suspension or termination.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">8. Account Suspension</h3>
                  <p className="text-gray-700 mb-2">iTutor may suspend or terminate student accounts for:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Repeated no-shows</li>
                    <li>Abuse of tutors</li>
                    <li>Fraudulent activity</li>
                    <li>Violation of platform rules</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">9. Limitation of Liability</h3>
                  <p className="text-gray-700 mb-2">iTutor is not liable for:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Tutor performance</li>
                    <li>Missed sessions caused by external video platforms</li>
                    <li>Technical issues beyond its control</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">10. Changes to These Terms</h3>
                  <p className="text-gray-700">
                    iTutor may update these Terms at any time. Continued use means acceptance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Parent/Guardian Terms */}
        <section id="parent" className="py-16 bg-gray-50 border-b border-gray-200">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="max-w-4xl">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8">
                Parent and Guardian Terms and Conditions
              </h2>

              <div className="space-y-10">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">1. Parental Responsibility</h3>
                  <p className="text-gray-700 mb-2">Parents or guardians are responsible for:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Approving student accounts</li>
                    <li>Managing payments</li>
                    <li>Monitoring student usage</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">2. Payments</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Parents are charged for sessions booked by linked student accounts.</li>
                    <li>Charges occur according to session rules (including no-show policies).</li>
                    <li>Payment disputes must be raised promptly.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">3. iTutors and Sessions</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Tutors are independent third parties.</li>
                    <li>iTutor does not guarantee tutor performance or academic outcomes.</li>
                    <li>Sessions may be conducted using external video platforms.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">4. No-Show and Cancellation Policy</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>If a student does not attend a session on time, partial charges may apply.</li>
                    <li>Refunds are limited and governed by platform rules.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">5. Data and Privacy</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Academic documents and session data are stored securely.</li>
                    <li>Parents may request data access or deletion where legally permitted.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">6. Account Control</h3>
                  <p className="text-gray-700 mb-2">Parents may:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Link or unlink student accounts</li>
                    <li>Restrict usage</li>
                    <li>Request account closure</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">7. Platform Decisions</h3>
                  <p className="text-gray-700 mb-2">iTutor's decisions regarding:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Session outcomes</li>
                    <li>Verification</li>
                    <li>Disputes</li>
                  </ul>
                  <p className="text-gray-700 mt-2">are final.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">8. Limitation of Liability</h3>
                  <p className="text-gray-700 mb-2">iTutor is not liable for:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Tutor behavior</li>
                    <li>Student academic outcomes</li>
                    <li>External platform failures</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">9. Changes to These Terms</h3>
                  <p className="text-gray-700">
                    Continued use of iTutor constitutes acceptance of updates.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* iTutor Terms */}
        <section id="tutor" className="py-16 bg-white">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="max-w-4xl">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8">
                iTutor Terms and Conditions
              </h2>

              <div className="space-y-10">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">1. iTutor Status</h3>
                  <p className="text-gray-700 leading-relaxed mb-2">
                    Tutors on iTutor are independent contractors, not employees, agents, or partners of iTutor.
                  </p>
                  <p className="text-gray-700 mb-2">iTutors:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Set their own prices</li>
                    <li>Control their availability</li>
                    <li>Are responsible for session content</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">2. Eligibility and Verification</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Tutors must provide accurate personal and academic information.</li>
                    <li>Tutors may submit documents (e.g. CSEC/CAPE results) for verification.</li>
                    <li>"Verified by iTutor" means documents were reviewed by iTutor — not verified by CXC or any exam board.</li>
                    <li>iTutor may revoke verification at any time.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">3. Video Platform Requirement</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Tutors must connect a valid Google Meet or Zoom account to host sessions.</li>
                    <li>Tutors may change providers but may not remove all providers.</li>
                    <li>Failure to maintain a valid connection may result in loss of booking access.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">4. Sessions and Payments</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Tutors are paid only after sessions are completed or marked according to platform rules.</li>
                    <li>iTutor deducts a platform fee from tutor earnings based on session price.</li>
                    <li>Payments may be reduced for student no-shows or early termination.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">5. No-Show Policy</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>If a student does not join within 33% of the session duration, iTutors may mark the session as a student no-show.</li>
                    <li>iTutors must act honestly when marking no-shows.</li>
                    <li>Abuse of the no-show system may result in penalties or removal.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">6. Conduct and Professionalism</h3>
                  <p className="text-gray-700 mb-2">iTutors must:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Act professionally</li>
                    <li>Teach only subjects they are competent in</li>
                    <li>Avoid harassment, discrimination, or cheating assistance</li>
                    <li>Not falsify academic documents</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">7. Ranking and Visibility</h3>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Verified tutors may be prioritized in search results.</li>
                    <li>Unverified tutors may have limited visibility or features (e.g. likes disabled).</li>
                    <li>Ranking is determined algorithmically and may change.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">8. Suspension and Termination</h3>
                  <p className="text-gray-700 mb-2">iTutor may suspend or terminate iTutor accounts for:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Fraud or document falsification</li>
                    <li>Repeated complaints</li>
                    <li>Misuse of session rules</li>
                    <li>Conduct violations</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">9. Liability Disclaimer</h3>
                  <p className="text-gray-700 mb-2">iTutor is not responsible for:</p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li>Tutor income expectations</li>
                    <li>Student performance</li>
                    <li>Technical failures of third-party platforms</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">10. Changes to These Terms</h3>
                  <p className="text-gray-700">
                    iTutor may update these Terms at any time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="bg-gray-50 border-t border-gray-200">
        <Footer />
      </div>
    </div>
  );
}


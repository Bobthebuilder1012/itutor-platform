'use client';

import Link from 'next/link';
import PublicPageHeader from '@/components/PublicPageHeader';
import { useProfile } from '@/lib/hooks/useProfile';

export default function PrivacyPolicyPage() {
  const { profile, loading: profileLoading } = useProfile();
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PublicPageHeader profile={profile} loading={profileLoading} />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 max-w-4xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-gray-600">Last updated: January 1, 2026</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-12 space-y-8">
          
          {/* 1. Overview */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Overview</h2>
            <p className="text-gray-700 leading-relaxed">
              iTutor ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our online tutoring platform. By using iTutor, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          {/* 2. Information We Collect */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>
            <div className="space-y-4 text-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Personal Information</h3>
                <p className="leading-relaxed mb-2">When you create an account, we collect:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Full name</li>
                  <li>Username</li>
                  <li>Email address</li>
                  <li>Country of residence</li>
                  <li>School name (optional)</li>
                  <li>Profile picture (optional)</li>
                  <li>Biography and teaching information (for iTutors)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Information</h3>
                <p className="leading-relaxed">
                  We collect bank account details for iTutor payouts. Payment card information for student/parent payments is processed securely through third-party payment processors and is not stored on our servers.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Usage Information</h3>
                <p className="leading-relaxed mb-2">We automatically collect:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Session attendance and completion data</li>
                  <li>Booking requests and confirmations</li>
                  <li>Messages sent through the platform</li>
                  <li>Search queries and browsing behavior</li>
                  <li>Device information and IP address</li>
                  <li>Browser type and operating system</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 3. How We Use Information */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Information</h2>
            <p className="text-gray-700 leading-relaxed mb-3">We use collected information to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>Provide and maintain the iTutor platform</li>
              <li>Process bookings and facilitate online sessions</li>
              <li>Process payments and payouts</li>
              <li>Send notifications about bookings, sessions, and account activity</li>
              <li>Provide customer support and respond to inquiries</li>
              <li>Improve our platform and develop new features</li>
              <li>Ensure platform security and prevent fraud</li>
              <li>Comply with legal obligations</li>
              <li>Send marketing communications (with your consent)</li>
            </ul>
          </section>

          {/* 4. Parent-Linked Accounts */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Parent-Linked Accounts and Visibility</h2>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <p className="text-gray-700 leading-relaxed mb-3">
                <strong>For students with parent-linked accounts:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Parents have visibility into their child's account activity</li>
                <li>Parents can view session history, booking requests, and attendance</li>
                <li>Parents can access learning analytics and progress reports</li>
                <li>Parents must approve booking requests before sessions are confirmed</li>
                <li>Parents receive notifications about their child's iTutor activity</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-3">
                This visibility exists to ensure parental oversight and student safety. Students under 18 should be aware that their parent/guardian has access to this information.
              </p>
            </div>
          </section>

          {/* 5. Verification Documents */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Verification Documents (Optional)</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              iTutors may optionally submit examination results (e.g., CXC slips) for verification purposes. When you submit verification:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>Documents are used solely to verify your subjects and grades</li>
              <li>Approved subjects and grades are displayed publicly on your profile</li>
              <li>You receive a "Verified iTutor" badge</li>
              <li>Documents are stored securely for audit and verification purposes</li>
              <li>You can manage the visibility of verified subjects at any time</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              <strong>Verification is optional.</strong> You can teach on iTutor without submitting verification documents.
            </p>
          </section>

          {/* 6. Sharing and Disclosure */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Sharing and Disclosure</h2>
            <div className="space-y-4 text-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Service Providers</h3>
                <p className="leading-relaxed mb-2">We share information with third-party service providers who assist us with:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Hosting and infrastructure:</strong> Cloud storage and servers</li>
                  <li><strong>Payment processing:</strong> Secure payment gateways</li>
                  <li><strong>Video conferencing:</strong> Google Meet and Zoom integrations</li>
                  <li><strong>Email services:</strong> Transactional and notification emails</li>
                  <li><strong>Analytics:</strong> Platform usage and performance monitoring</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Other Users</h3>
                <p className="leading-relaxed">
                  Certain information is visible to other users as part of the platform's functionality:
                </p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li>iTutor profiles (name, username, bio, subjects, ratings) are visible to students and parents</li>
                  <li>Student profiles (name, school) are visible to iTutors during booking requests</li>
                  <li>Verified subjects and grades are displayed publicly for verified iTutors</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Legal Compliance</h3>
                <p className="leading-relaxed">
                  We may disclose information when required by law, legal process, or to:
                </p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li>Comply with court orders or government requests</li>
                  <li>Enforce our Terms and Conditions</li>
                  <li>Protect the safety and security of users</li>
                  <li>Prevent fraud or illegal activity</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 7. Data Retention */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Data Retention</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              We retain your information for as long as necessary to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>Provide our services and maintain your account</li>
              <li>Comply with legal obligations (e.g., financial records, tax reporting)</li>
              <li>Resolve disputes and enforce our agreements</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              <strong>Verification documents</strong> are retained for audit and verification purposes even after your account is closed, unless you request deletion and we have no legal obligation to retain them.
            </p>
          </section>

          {/* 8. Security */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Security</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              We implement reasonable technical and organizational measures to protect your information, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>Encryption of data in transit and at rest</li>
              <li>Secure authentication and password requirements</li>
              <li>Regular security audits and monitoring</li>
              <li>Limited access to personal data by employees</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
            </p>
          </section>

          {/* 9. Your Rights and Choices */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Your Rights and Choices</h2>
            <div className="space-y-3 text-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Access and Correction</h3>
                <p className="leading-relaxed">
                  You can access and update your account information at any time through your Settings page.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Account Deletion</h3>
                <p className="leading-relaxed">
                  You may request deletion of your account by contacting us at <a href="mailto:support@myitutor.com" className="text-itutor-green hover:underline">support@myitutor.com</a>. We will delete your information subject to legal retention requirements.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Marketing Communications</h3>
                <p className="leading-relaxed">
                  You can opt out of marketing emails by clicking the "unsubscribe" link in any marketing email or updating your notification preferences in Settings.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Data Portability</h3>
                <p className="leading-relaxed">
                  You may request a copy of your personal data in a portable format by contacting us.
                </p>
              </div>
            </div>
          </section>

          {/* 10. Children's Privacy */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Children's Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Students under 18 may use iTutor with parental consent. For students under 18, parents/guardians must:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mt-3">
              <li>Create and link their child's account</li>
              <li>Approve all booking requests</li>
              <li>Have visibility into their child's activity</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              We do not knowingly collect information from children under 13 without verified parental consent.
            </p>
          </section>

          {/* 11. Contact Us */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              If you have questions, concerns, or requests regarding this Privacy Policy or your personal information, please contact us:
            </p>
            <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
              <p className="text-gray-900 font-semibold mb-1">iTutor Support</p>
              <p className="text-gray-700">
                Email: <a href="mailto:support@myitutor.com" className="text-itutor-green hover:underline font-semibold">support@myitutor.com</a>
              </p>
            </div>
          </section>

          {/* 12. Changes to This Policy */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. When we make changes, we will:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mt-3">
              <li>Update the "Last updated" date at the top of this page</li>
              <li>Notify you via email or platform notification for significant changes</li>
              <li>Post the updated policy on our platform</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              Your continued use of iTutor after changes are posted constitutes acceptance of the updated Privacy Policy.
            </p>
          </section>

        </div>

        {/* Back to Home */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-itutor-green hover:text-emerald-600 font-semibold transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-itutor-black text-itutor-white py-8 mt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-itutor-muted">
            &copy; iTutor. Nora Digital, Ltd.
          </p>
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <Link href="/terms" className="hover:text-itutor-green transition-colors">
              Terms & Conditions
            </Link>
            <Link href="/itutors/requirements" className="hover:text-itutor-green transition-colors">
              iTutor Requirements
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


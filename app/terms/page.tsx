import MarketingShell from '@/components/landing/MarketingShell';

export const metadata = { title: 'Terms of Service — iTutor' };

const SECTIONS = [
  {
    title: 'Acceptance of Terms',
    body: 'By creating an account or using iTutor in any way, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, you may not use the platform. iTutor is operated by Astronova Technologies Ltd., a company incorporated in Trinidad and Tobago.',
  },
  {
    title: 'Eligibility',
    body: 'You must be at least 13 years old to use iTutor. Students under 18 require parental or guardian consent. By registering, you confirm that you meet these requirements. Tutors must be at least 18 years old and pass our verification process before going live on the platform.',
  },
  {
    title: 'Accounts & Registration',
    body: 'You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must provide accurate, current, and complete information during registration and keep your profile up to date. iTutor reserves the right to suspend or terminate accounts that contain false information or that violate these Terms.',
  },
  {
    title: 'Tutor Verification & Standards',
    body: 'All tutors on iTutor must complete our verification process, including a subject-specific assessment and identity check. Once verified, tutors are expected to maintain punctuality, preparation, and professional conduct in every session. iTutor may remove or suspend tutors who receive repeated poor reviews, fail to complete sessions, or breach these Terms.',
  },
  {
    title: 'Booking & Cancellation',
    body: 'Bookings are confirmed once payment is processed. Students may cancel up to 24 hours before a session for a full refund. Cancellations made within 24 hours of a session may be subject to a cancellation fee as described in the relevant tutor\'s profile. Tutors who cancel sessions repeatedly without notice may have their accounts suspended.',
  },
  {
    title: 'Payments & Refunds',
    body: 'All payments are processed securely through our payment provider. Prices are displayed in Trinidad and Tobago dollars (TTD). iTutor charges a platform fee on each transaction. Refunds are issued at our discretion following investigation of disputes. Payouts to tutors are made within 3–5 business days following session completion.',
  },
  {
    title: 'Prohibited Conduct',
    body: 'You may not use iTutor for any unlawful purpose, to harass or harm other users, to distribute spam or malware, to attempt to bypass our verification systems, or to share another user\'s personal information without their consent. Academic dishonesty — including using iTutor to complete assessments on behalf of a student — is strictly prohibited and will result in immediate account termination.',
  },
  {
    title: 'Intellectual Property',
    body: 'All content on the iTutor platform — including the logo, design, software, and original text — is the property of Astronova Technologies Ltd. and is protected by copyright law. Tutors retain ownership of their own session materials but grant iTutor a licence to display and deliver them within the platform.',
  },
  {
    title: 'Limitation of Liability',
    body: 'iTutor provides the platform as a marketplace connecting students and tutors. We are not liable for the quality, safety, or legality of sessions delivered by tutors. To the maximum extent permitted by law, Astronova Technologies Ltd. shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.',
  },
  {
    title: 'Changes to These Terms',
    body: 'We may update these Terms from time to time. We will notify you of material changes via email or an in-app notification at least 14 days before they take effect. Continued use of iTutor after changes take effect constitutes your acceptance of the new Terms.',
  },
];

export default function TermsPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">Terms of Service</h1>
        <p className="mt-4 text-[#555555]">Operated by Astronova Technologies Ltd.</p>
        <p className="mt-1 text-sm text-black/50">Last updated: June 2026 — placeholder until legal review</p>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-32">
        <div className="space-y-12">
          {SECTIONS.map((s, i) => (
            <div key={i}>
              <p className="text-xs uppercase tracking-wider text-black/40">Section {i + 1}</p>
              <h3 className="mt-2 text-2xl font-bold text-black">{s.title}</h3>
              <p className="mt-4 leading-relaxed text-[#555555]">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 rounded-2xl bg-[#F5F5F5] p-6 text-sm text-[#555555]">
          <p className="font-semibold text-black mb-2">Questions about these Terms?</p>
          <p>Email us at <a href="mailto:legal@myitutor.com" className="text-[#199356] hover:underline">legal@myitutor.com</a></p>
        </div>
      </section>
    </MarketingShell>
  );
}

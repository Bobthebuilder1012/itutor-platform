import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import FAQAccordion from '@/components/landing/FAQAccordion';

interface FooterProps {
  role?: 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin' | null;
}

const offerNav = [
  { title: 'CSEC Subjects', summary: 'Secondary exams, core & elective subjects', href: '/search' },
  { title: 'CAPE Subjects', summary: 'Sixth form units & advanced programmes', href: '/search' },
  { title: 'Exam Preparation', summary: 'Past papers, SBAs & exam strategy', href: '/search' },
  { title: 'Popular Topics', summary: 'Communities, lessons & study help', href: '/communities' },
];

function SocialLinks() {
  return (
    <div className="flex gap-3">
      <a
        href="https://www.facebook.com/share/1E91o2u1yM/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Facebook"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-white/10 text-[#d1d5db] transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-[rgba(34,197,94,0.15)]"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      </a>
      <a
        href="https://www.instagram.com/myitutor?igsh=MXgyNjdrMTR1ampyag%3D%3D&utm_source=qr"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-white/10 text-[#d1d5db] transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-[rgba(34,197,94,0.15)]"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
        </svg>
      </a>
      <a
        href="https://www.linkedin.com/company/myitutor/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="LinkedIn"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-white/10 text-[#d1d5db] transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-[rgba(34,197,94,0.15)]"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>
    </div>
  );
}

export default function Footer({ role: _role = null }: FooterProps = {}) {
  return (
    <footer
      className="relative mx-4 mb-4 mt-10 overflow-hidden rounded-[28px] border border-white/[0.08] 2xl:mx-6 2xl:mb-6 2xl:mt-14"
      style={{
        background: 'rgba(5,15,10,0.85)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      }}
    >
      {/* Green glow at top */}
      <div
        className="pointer-events-none absolute -top-[150px] left-[20%] h-[400px] w-[400px] rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(34,197,94,0.15),transparent 70%)' }}
      />

      <div className="relative z-10 mx-auto max-w-[1280px] px-10 pb-9 pt-[70px] 2xl:px-16 2xl:pb-12 2xl:pt-24">
        <div className="mb-12 grid grid-cols-1 gap-x-[60px] gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] 2xl:mb-20">

          {/* Left: Company */}
          <div className="flex flex-col">
            <div>
              <h3 className="mb-[22px] text-xl font-bold tracking-tight text-white">Company</h3>
              <div className="flex flex-col gap-0">
                <Link href="/about" className="block py-[7px] text-[15px] text-[#d1d5db] transition-colors hover:text-[#4ade80]">About</Link>
                <a href="mailto:support@myitutor.com" className="block py-[7px] text-[15px] text-[#d1d5db] transition-colors hover:text-[#4ade80]">
                  Contact: support@myitutor.com
                </a>
                <Link href="/privacy" className="block py-[7px] text-[15px] text-[#d1d5db] transition-colors hover:text-[#4ade80]">Privacy</Link>
                <Link href="/terms" className="block py-[7px] text-[15px] text-[#d1d5db] transition-colors hover:text-[#4ade80]">Terms &amp; Conditions</Link>
              </div>
            </div>
            <div className="mt-9 border-t border-white/[0.08] pt-9">
              <h3 className="mb-[14px] text-xl font-bold tracking-tight text-white">Follow Us</h3>
              <SocialLinks />
            </div>
          </div>

          {/* Centre: Everything We Offer */}
          <div className="min-w-0 lg:text-center">
            <h2 className="mb-[22px] text-xl font-bold tracking-tight text-white">Everything We Offer</h2>
            <nav aria-label="What we offer" className="mx-auto flex max-w-md flex-col lg:max-w-none">
              {offerNav.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group flex items-start justify-between gap-2 border-b border-white/[0.08] py-[14px] first:pt-0 transition-all hover:border-[rgba(34,197,94,0.5)] hover:pl-1.5"
                >
                  <div className="min-w-0 flex-1 text-left">
                    <span className="block text-[15px] font-semibold text-white transition-colors group-hover:text-[#4ade80]">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-[#9ca3af]">{item.summary}</span>
                  </div>
                  <span className="mt-0.5 text-[18px] text-[#6b7280] transition-colors group-hover:text-[#4ade80]">›</span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Right: FAQ */}
          <div className="min-w-0">
            <FAQAccordion embedded />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-[26px] text-sm text-[#9ca3af]">
          <div>© iTutor. Nora Digital, Ltd.</div>
          <div className="flex gap-7">
            <a href="mailto:support@myitutor.com" className="transition-colors hover:text-white">Help</a>
            <Link href="/privacy" className="transition-colors hover:text-white">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-white">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

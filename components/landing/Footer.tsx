import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import FAQAccordion from '@/components/landing/FAQAccordion';

interface FooterProps {
  /** Kept for call-site compatibility; footer links are no longer role-dependent. */
  role?: 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin' | null;
}

const offerNav = [
  {
    title: 'CSEC Subjects',
    summary: 'Secondary exams, core & elective subjects',
    href: '/search',
  },
  {
    title: 'CAPE Subjects',
    summary: 'Sixth form units & advanced programmes',
    href: '/search',
  },
  {
    title: 'Exam Preparation',
    summary: 'Past papers, SBAs & exam strategy',
    href: '/search',
  },
  {
    title: 'Popular Topics',
    summary: 'Communities, groups & study help',
    href: '/communities',
  },
];

function SocialLinks() {
  return (
    <div className="flex gap-6 2xl:gap-8 3xl:gap-10">
      <a
        href="https://www.facebook.com/share/1E91o2u1yM/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-itutor-muted transition-colors hover:text-itutor-green"
        aria-label="Facebook"
      >
        <svg className="h-8 w-8 2xl:h-10 2xl:w-10 3xl:h-12 3xl:w-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      </a>
      <a
        href="https://www.instagram.com/myitutor?igsh=MXgyNjdrMTR1ampyag%3D%3D&utm_source=qr"
        target="_blank"
        rel="noopener noreferrer"
        className="text-itutor-muted transition-colors hover:text-itutor-green"
        aria-label="Instagram"
      >
        <svg className="h-8 w-8 2xl:h-10 2xl:w-10 3xl:h-12 3xl:w-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      </a>
      <a
        href="https://www.linkedin.com/company/myitutor/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-itutor-muted transition-colors hover:text-itutor-green"
        aria-label="LinkedIn"
      >
        <svg className="h-8 w-8 2xl:h-10 2xl:w-10 3xl:h-12 3xl:w-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>
    </div>
  );
}

export default function Footer({ role: _role = null }: FooterProps = {}) {
  return (
    <footer className="border-t border-itutor-border bg-itutor-black">
      <div className="container mx-auto px-4 py-12 sm:px-6 sm:py-16 lg:px-8 2xl:py-24 2xl:px-12 3xl:py-32 3xl:px-16">
        <div className="mb-12 grid grid-cols-1 items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-x-10 2xl:mb-20 2xl:gap-x-16 2xl:gap-y-16 3xl:mb-28 3xl:gap-x-24">
          <div className="flex flex-col">
            <div>
              <h3 className="mb-4 text-lg font-semibold text-itutor-white sm:mb-6 2xl:mb-7 2xl:text-xl 3xl:text-2xl">Company</h3>
              <ul className="space-y-3 2xl:space-y-4 3xl:space-y-5">
                <li>
                  <Link href="/about" className="text-itutor-muted transition-colors hover:text-itutor-white 2xl:text-base 3xl:text-lg">
                    About
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:support@myitutor.com"
                    className="text-itutor-muted transition-colors hover:text-itutor-white 2xl:text-base 3xl:text-lg"
                  >
                    Contact: support@myitutor.com
                  </a>
                </li>
                <li>
                  <Link href="/privacy" className="text-itutor-muted transition-colors hover:text-itutor-white 2xl:text-base 3xl:text-lg">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-itutor-muted transition-colors hover:text-itutor-white 2xl:text-base 3xl:text-lg">
                    Terms & Conditions
                  </Link>
                </li>
              </ul>
            </div>
            <div className="mt-8 border-t border-itutor-border pt-8 2xl:mt-10 2xl:pt-10">
              <h3 className="mb-4 text-lg font-semibold text-itutor-white sm:mb-6 2xl:mb-7 2xl:text-xl 3xl:text-2xl">Follow Us</h3>
              <SocialLinks />
            </div>
          </div>

          <div className="min-w-0 lg:text-center">
            <h2 className="mb-4 text-xl font-bold text-itutor-white sm:mb-6 sm:text-2xl 2xl:mb-7 2xl:text-3xl 3xl:text-4xl">
              Everything We Offer
            </h2>
            <nav aria-label="What we offer" className="mx-auto flex max-w-md flex-col lg:max-w-none">
              {offerNav.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group flex items-start justify-between gap-2 border-b border-itutor-border py-2.5 first:pt-0 transition-colors hover:border-itutor-green/50 sm:gap-3 sm:py-3 2xl:py-4 2xl:gap-4 3xl:py-5"
                >
                  <div className="min-w-0 flex-1 text-left">
                    <span className="font-semibold text-itutor-white transition-colors group-hover:text-itutor-green 2xl:text-base 3xl:text-lg">
                      {item.title}
                    </span>
                    <p className="mt-0.5 text-xs leading-snug text-itutor-muted 2xl:text-sm 3xl:text-base">
                      {item.summary}
                    </p>
                  </div>
                  <ChevronRightIcon
                    className="mt-0.5 h-5 w-5 shrink-0 text-itutor-muted transition-colors group-hover:translate-x-0.5 group-hover:text-itutor-green 2xl:h-6 2xl:w-6 3xl:h-7 3xl:w-7"
                    aria-hidden
                  />
                </Link>
              ))}
            </nav>
          </div>

          <div className="min-w-0">
            <FAQAccordion embedded />
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-itutor-border pt-8 md:flex-row 2xl:pt-10 3xl:pt-12">
          <p className="text-sm text-itutor-muted 2xl:text-base 3xl:text-lg">&copy; iTutor. Nora Digital, Ltd.</p>
          <div className="flex gap-4 text-sm 2xl:gap-6 2xl:text-base 3xl:gap-8 3xl:text-lg">
            <a
              href="mailto:support@myitutor.com"
              className="text-itutor-muted transition-colors hover:text-itutor-white"
            >
              Help
            </a>
            <Link href="/terms" className="text-itutor-muted transition-colors hover:text-itutor-white">
              Privacy
            </Link>
            <Link href="/terms" className="text-itutor-muted transition-colors hover:text-itutor-white">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

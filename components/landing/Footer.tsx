'use client';

import { useState } from 'react';
import { ChevronDown, Mail } from 'lucide-react';
import Image from 'next/image';

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);
const LinkedinIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);
const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.42a8.16 8.16 0 0 0 4.77 1.52V6.49a4.85 4.85 0 0 1-1.84.2Z" />
  </svg>
);

const offers = [
  'CSEC Subjects',
  'CAPE Subjects',
  'SEA Preparation',
  'Exam Preparation',
  'Past Papers & SBAs',
];

const company = [
  { label: 'About', href: '/about' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Become a Tutor', href: '/signup?role=tutor' },
];

const faqs = [
  { q: 'What is iTutor?', a: 'iTutor is a Caribbean-built platform that connects students with verified 1-on-1 tutors for SEA, CSEC, and CAPE preparation.' },
  { q: 'Who are the iTutors?', a: 'All tutors are verified Caribbean educators — qualified teachers, top-graded graduates, and subject specialists vetted by our team.' },
  { q: 'Is iTutor safe for students?', a: 'Yes. Sessions run on Google Meet or Zoom, all tutors are background-checked, and parents can join or review every session.' },
  { q: 'Is it aligned with CSEC/CAPE?', a: 'Every tutor follows the latest CSEC and CAPE syllabuses, with past-paper practice built into every learning track.' },
  { q: 'How does booking work?', a: "Browse tutors, pick a time that suits you, and confirm — you'll get a calendar invite with the meeting link instantly." },
];

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-4 text-left transition-colors hover:text-white"
      >
        <span className="font-medium text-white">{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid overflow-hidden text-sm text-white/60 transition-all duration-300 ${open ? 'grid-rows-[1fr] pb-4' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0">{a}</div>
      </div>
    </div>
  );
}

const socials = [
  { Icon: FacebookIcon,  label: 'Facebook',  href: 'https://www.facebook.com/share/18tvYgPa8J/?mibextid=wwXIfr' },
  { Icon: InstagramIcon, label: 'Instagram', href: 'https://www.instagram.com/itutor.site?igsh=MXgyNjdrMTR1ampyag%3D%3D&utm_source=qr' },
  { Icon: TikTokIcon,    label: 'TikTok',    href: 'https://www.tiktok.com/@itutor.site?_r=1&_t=ZS-96r391xYFq0' },
  { Icon: LinkedinIcon,  label: 'LinkedIn',  href: 'https://www.linkedin.com/company/myitutor/' },
];

export default function Footer() {
  return (
    <footer id="faq" className="bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 pb-10 pt-20 sm:px-10">
        <div className="grid gap-12 lg:grid-cols-12">
          {/* Brand column */}
          <div className="lg:col-span-4">
            <Image
              src="/assets/logo/itutor-logo-new.png"
              alt="iTutor"
              width={200}
              height={52}
              className="h-12 w-auto object-contain"
            />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/60">
              The Caribbean&apos;s home for verified tutors. Built for SEA, CSEC and CAPE students who want real results.
            </p>
            <a
              href="mailto:support@myitutor.com"
              className="mt-6 inline-flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors"
            >
              <Mail className="h-4 w-4 text-brand" />
              support@myitutor.com
            </a>
            <div className="mt-6 flex gap-2">
              {socials.map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/80 transition-all hover:bg-brand hover:text-white"
                  aria-label={label}
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Company */}
          <div className="lg:col-span-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">Company</h3>
            <ul className="mt-5 space-y-3 text-sm">
              {company.map((c) => (
                <li key={c.label}>
                  <a href={c.href} className="text-white/75 transition-colors hover:text-white">
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Offers */}
          <div className="lg:col-span-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">Programmes</h3>
            <ul className="mt-5 space-y-3 text-sm">
              {offers.map((o) => (
                <li key={o}>
                  <a href="#" className="text-white/75 transition-colors hover:text-white">
                    {o}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* FAQ */}
          <div className="lg:col-span-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">Frequently Asked</h3>
            <div className="mt-3">
              {faqs.map((f) => (
                <Faq key={f.q} {...f} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} iTutor — Astronova Technologies Ltd. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms</a>
            <a href="/help" className="hover:text-white transition-colors">Help</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

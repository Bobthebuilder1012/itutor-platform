'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed inset-x-0 top-0 z-50 transition-all ${
        scrolled
          ? 'bg-black/85 backdrop-blur-xl border-b border-white/10'
          : 'bg-black border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8 sm:py-4">
        <a href="#" className="flex items-center" aria-label="iTutor home">
          <Image
            src="/assets/logo/itutor-logo-new.png"
            alt="iTutor"
            width={200}
            height={52}
            className="h-12 w-auto object-contain"
            priority
          />
        </a>
        <nav className="hidden items-center gap-8 text-sm font-medium text-white/70 md:flex">
          <a href="/how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="/about" className="hover:text-white transition-colors">About</a>
          <a href="/faq" className="hover:text-white transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="/signup"
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-white/80 hover:text-white sm:inline-flex"
          >
            Sign Up
          </a>
          <a
            href="/login"
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-pop transition-transform hover:scale-[1.04] active:scale-95"
          >
            Log In
          </a>
        </div>
      </div>
    </motion.header>
  );
}

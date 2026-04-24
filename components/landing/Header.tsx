'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CompleteRoleModal from '@/components/auth/CompleteRoleModal';

export default function Header() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [completeRoleOpen, setCompleteRoleOpen] = useState(false);

  useEffect(() => {
    setCompleteRoleOpen(searchParams.get('auth') === 'complete-role');
  }, [searchParams]);

  const handleCloseCompleteRole = () => {
    setCompleteRoleOpen(false);
    router.replace('/');
  };

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/[0.08]"
      style={{
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      }}
    >
      <nav className="mx-auto flex items-center justify-between px-6 py-4 lg:px-10">
        <Link href="/" className="flex-shrink-0">
          <img
            src="/assets/logo/itutor-logo-dark.png"
            alt="iTutor"
            className="h-10 w-auto sm:h-12"
          />
        </Link>

        <div className="flex items-center gap-3.5">
          <Link
            href="/signup"
            className="rounded-xl px-[18px] py-2.5 text-[15px] font-medium text-white/90 transition-colors hover:bg-white/[0.08]"
          >
            Sign Up
          </Link>
          <Link
            href="/login"
            className="rounded-xl px-[22px] py-2.5 text-[15px] font-semibold text-white transition-all hover:-translate-y-px"
            style={{
              background: 'linear-gradient(135deg,#22c55e,#16a34a)',
              boxShadow: '0 4px 14px rgba(34,197,94,0.4),inset 0 1px 0 rgba(255,255,255,0.3)',
            }}
          >
            Log In
          </Link>
        </div>
      </nav>
      <CompleteRoleModal isOpen={completeRoleOpen} onClose={handleCloseCompleteRole} />
    </header>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import Footer from '@/components/landing/Footer';

function MarketingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-black border-b border-transparent">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8 sm:py-4">
        <Link href="/" className="flex items-center" aria-label="iTutor home">
          <Image src="/assets/logo/itutor-logo-new.png" alt="iTutor" width={200} height={52} className="h-12 w-auto object-contain" />
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-white/70 md:flex">
          <Link href="/how-it-works" className="hover:text-white transition-colors">How it works</Link>
          <Link href="/faq" className="hover:text-white transition-colors">FAQ</Link>
          <Link href="/about" className="hover:text-white transition-colors">About</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/signup" className="hidden rounded-full px-4 py-2 text-sm font-medium text-white/80 hover:text-white sm:inline-flex transition-colors">
            Sign Up
          </Link>
          <Link href="/login" className="rounded-full bg-[#199356] px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.04] active:scale-95">
            Log In
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-black">
      <MarketingNav />
      <main className="pt-20">{children}</main>
      <Footer />
    </div>
  );
}

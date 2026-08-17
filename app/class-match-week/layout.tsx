/**
 * Portal shell for every /class-match-week/* page.
 *
 * A server layout with no auth logic — each page gates itself, because the
 * landing, match and signup pages are anonymous while results, explore,
 * my-classes and dashboard are not, and a layout cannot know which it is
 * wrapping without re-doing the page's work.
 *
 * Tabs are plain Links without an active state: usePathname would force this
 * layout (and everything under it) client-side for one underline. At three
 * tabs the trade is not worth it; noted rather than hidden.
 */

import Link from 'next/link';

export default function ClassMatchWeekLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 overflow-x-auto px-4 py-2.5">
          <Link
            href="/class-match-week"
            className="shrink-0 rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          >
            Class Match Week
          </Link>
          <nav className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ink">
            <Link href="/class-match-week/explore" className="rounded-full px-3 py-1.5 transition-colors hover:bg-mint">
              Explore
            </Link>
            <Link href="/class-match-week/my-classes" className="rounded-full px-3 py-1.5 transition-colors hover:bg-mint">
              My classes
            </Link>
            <Link href="/class-match-week/dashboard" className="rounded-full px-3 py-1.5 transition-colors hover:bg-mint">
              Dashboard
            </Link>
          </nav>
          <Link
            href="/"
            className="ml-auto shrink-0 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            ← iTutor
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

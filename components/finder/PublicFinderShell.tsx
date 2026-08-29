'use client';

/**
 * The chrome around the Finder's LOGGED-OUT screens — which is the student
 * shell, in anonymous mode, with destinations a visitor without an account can
 * actually reach.
 *
 * Deliberately not a new layout. /find/results and /find/browse hand off to
 * /student/explore/[id], and until now they did it from a bare centred column
 * — so the moment a family clicked through, the product visibly changed shape
 * around them. Reusing StudentShell means the rail, the top bar, the search
 * box, the mobile bottom bar and the collapse behaviour are the same objects
 * the marketplace uses, and stay the same when the marketplace changes.
 *
 * It opens COLLAPSED. The rail here is orientation — this is a real product
 * with these sections — not a menu the visitor is navigating. What they came
 * for is the matches.
 *
 * LOCKED ITEMS ARE SHOWN, NOT HIDDEN. My Classes, Subscriptions and Tools need
 * an account, so they dim and carry a padlock, and clicking one goes to signup
 * with a redirect back to that exact page. A rail that silently grows four new
 * icons after signup never tells the visitor what the account was for; this one
 * does, on the screen whose whole argument is that a free account saves this.
 */

import {
  House,
  Search,
  GraduationCap,
  Sparkles,
  CreditCard,
  Wrench,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { StudentShell, type StudentNavItem } from '@/components/student/StudentShell';
import { loginThen, signupThen, type FinderRole } from '@/lib/finder/links';

export default function PublicFinderShell({
  children,
  role,
  /**
   * Where signing up or logging in should return the visitor. The page they are
   * standing on, so the account continues the journey instead of interrupting
   * it — see lib/finder/links.ts for why every one of these goes via
   * /find/claim.
   */
  returnTo,
}: {
  children: ReactNode;
  role: FinderRole;
  returnTo: string;
}) {
  // The parent's equivalents of the account-only pages. Same reason
  // CampaignShell resolves its "Back to iTutor" from the role: a parent sent to
  // /student/classes lands somewhere that is not theirs.
  const isParent = role === 'parent';
  const classesPath = isParent ? '/parent/classes' : '/student/classes';
  const subsPath = isParent ? '/parent/subscriptions' : '/student/subscriptions';

  const nav: StudentNavItem[] = [
    {
      to: '/',
      label: 'Home',
      icon: House,
      exact: true,
      tint: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30',
    },
    {
      to: `/find/browse?role=${role}`,
      label: 'Explore',
      icon: Search,
      tint: 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30',
    },
    {
      to: '/find/results',
      label: 'My Matches',
      icon: Sparkles,
      tint: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30',
    },
    {
      to: signupThen(role, classesPath),
      label: 'My Classes',
      icon: GraduationCap,
      tint: 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30',
      locked: true,
    },
    {
      to: signupThen(role, subsPath),
      label: 'Subscriptions',
      icon: CreditCard,
      tint: 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-400/30',
      locked: true,
    },
    // A parent has no /student/tools, and study tools are not what they came
    // for. Their sixth section is the children the classes are being found for.
    isParent
      ? {
          to: signupThen(role, '/parent/children'),
          label: 'My Children',
          icon: Users,
          tint: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30',
          locked: true,
        }
      : {
          to: signupThen(role, '/student/tools'),
          label: 'Tools',
          icon: Wrench,
          tint: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30',
          locked: true,
        },
  ];

  return (
    <StudentShell
      anonymous
      navItems={nav}
      signupHref={signupThen(role, returnTo)}
      loginHref={loginThen(returnTo)}
      // The marketplace's own search is authenticated-only; browse is the
      // public catalogue, so that is where this box has to land.
      searchAction={(q) =>
        `/find/browse?role=${role}${q ? `&q=${encodeURIComponent(q)}` : ''}`
      }
    >
      {children}
    </StudentShell>
  );
}

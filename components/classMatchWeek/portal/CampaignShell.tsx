'use client';

/**
 * The Class Match Week portal's chrome — which is the STUDENT shell, with
 * campaign destinations.
 *
 * Deliberately not a new navigation. Class Match Week is a section of iTutor,
 * not a separate product: reusing StudentShell means the sidebar, the mobile
 * bottom bar, collapse behaviour, the profile menu, notifications and logout
 * all behave exactly as they do everywhere else, and stay that way when the
 * main site changes. Only the destinations differ.
 *
 * Home points at the campaign dashboard rather than the student one, because
 * a visitor inside the campaign expects "home" to mean the campaign. The last
 * item is the way back out to the rest of iTutor.
 *
 * THAT LAST ITEM IS ROLE-AWARE, and has to be. The portal gates on being
 * signed in, not on role — a parent reaches it from the CTA in ParentShell and
 * a teacher from the one in TutorShell — but "Back to iTutor" used to be a
 * hardcoded /student/dashboard for all three. The student dashboard bounces any
 * non-student to /login (app/student/dashboard/page.tsx), so a teacher or
 * parent leaving the campaign landed on a login screen while still perfectly
 * signed in. It reads as being signed out, and the session it destroys is the
 * one thing it never touched.
 */

import { LayoutDashboard, Search, GraduationCap, Users as CampaignMark, House } from 'lucide-react';
import { StudentShell, type StudentNavItem } from '@/components/student/StudentShell';
import { useProfile } from '@/lib/hooks/useProfile';

/** Where "the rest of iTutor" is, for whoever is signed in. */
export function homeForRole(role: string | null | undefined): string {
  switch (role) {
    case 'tutor':
      return '/tutor/dashboard';
    case 'parent':
      return '/parent/dashboard';
    case 'admin':
      return '/admin/dashboard';
    case 'reviewer':
      return '/reviewer/dashboard';
    case 'student':
      return '/student/dashboard';
    default:
      // No profile yet — a signup that has not finished writing its row, or a
      // role this shell does not know. The public landing page is the one
      // destination that never bounces anyone.
      return '/';
  }
}

const campaignNav: StudentNavItem[] = [
  {
    to: '/class-match-week/dashboard',
    label: 'Home',
    icon: LayoutDashboard,
    exact: true,
    tint: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30',
  },
  {
    to: '/class-match-week/explore',
    label: 'Explore',
    icon: Search,
    tint: 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30',
  },
  {
    to: '/class-match-week/my-classes',
    label: 'My Classes',
    icon: GraduationCap,
    tint: 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30',
  },
  {
    to: '/class-match-week/results',
    label: 'My Matches',
    icon: CampaignMark,
    tint: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30',
  },
];

export default function CampaignShell({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();

  const navItems: StudentNavItem[] = [
    ...campaignNav,
    {
      to: homeForRole(profile?.role),
      label: 'Back to iTutor',
      icon: House,
      tint: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30',
    },
  ];

  return <StudentShell navItems={navItems}>{children}</StudentShell>;
}

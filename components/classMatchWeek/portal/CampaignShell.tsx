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
 */

import { LayoutDashboard, Search, GraduationCap, Sparkles, House } from 'lucide-react';
import { StudentShell, type StudentNavItem } from '@/components/student/StudentShell';

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
    icon: Sparkles,
    tint: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30',
  },
  {
    to: '/student/dashboard',
    label: 'Back to iTutor',
    icon: House,
    tint: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30',
  },
];

export default function CampaignShell({ children }: { children: React.ReactNode }) {
  return <StudentShell navItems={campaignNav}>{children}</StudentShell>;
}

/**
 * Chrome for the signed-in half of Class Match Week.
 *
 * A route group, so these four pages keep their URLs (/class-match-week/…)
 * while the anonymous pages — landing, questionnaire, signup — stay outside it
 * and render without a signed-in sidebar. Wrapping those in an account shell
 * would show a profile menu to someone who has no account yet.
 */

import CampaignShell from '@/components/classMatchWeek/portal/CampaignShell';

export default function CampaignPortalLayout({ children }: { children: React.ReactNode }) {
  return <CampaignShell>{children}</CampaignShell>;
}

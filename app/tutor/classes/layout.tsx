import EndDateGate from '@/components/tutor/EndDateGate';

/**
 * Gates class-management and payout routes until every class the tutor
 * owns has an end date. Scoped to these sections on purpose — messaging,
 * live sessions and the dashboard stay reachable so a tutor is never
 * blocked from a lesson that's about to start.
 */
export default function TutorGatedLayout({ children }: { children: React.ReactNode }) {
  return <EndDateGate>{children}</EndDateGate>;
}

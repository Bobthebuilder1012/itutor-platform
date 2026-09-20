import EndDateGate from '@/components/tutor/EndDateGate';

/**
 * Same gate as My Classes and My Business: a tutor with a class missing an end
 * date finishes that first. Inviting students into a class with no end date is
 * exactly the situation the gate exists to prevent.
 */
export default function TutorLaunchLayout({ children }: { children: React.ReactNode }) {
  return <EndDateGate>{children}</EndDateGate>;
}

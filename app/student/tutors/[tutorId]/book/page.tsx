'use client';

// Dedicated 1:1 booking route. Renders the same tutor component as the profile
// route, which reads its mode from the pathname — ending in `/book` puts it in
// booking-first mode (auto-opens the 1:1 flow, hides the class-led sections).
// The 1:1 marketplace ("Book a lesson") links here, so that experience stays
// booking-first while /student/tutors/[id] remains the class-led profile.
import TutorProfilePage from '../page';

export default function TutorBookPage() {
  return <TutorProfilePage />;
}

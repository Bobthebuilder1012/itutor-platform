import Header from '@/components/landing/Header';
import Hero from '@/components/landing/Hero';
import FeaturedTutors from '@/components/landing/FeaturedTutors';
import HowItWorksSection from '@/components/landing/HowItWorksSection';
import CredibilityStrip from '@/components/landing/CredibilityStrip';
import Footer from '@/components/landing/Footer';
import { getFeaturedTutors } from '@/lib/services/landingTutorsService';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';

export const revalidate = 300; // Revalidate every 5 minutes

export default async function HomePage() {
  const tutors = await getFeaturedTutors();
  const paidClassesEnabled = isPaidClassesEnabled();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f9fefb]">


      <Header />
      <main>
        <Hero />
        <FeaturedTutors tutors={tutors} paidClassesEnabled={paidClassesEnabled} />
        <HowItWorksSection />
        <CredibilityStrip />
      </main>
      <Footer />
    </div>
  );
}

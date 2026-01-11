import Header from '@/components/landing/Header';
import Hero from '@/components/landing/Hero';
import FeaturedTutors from '@/components/landing/FeaturedTutors';
import HowItWorksSection from '@/components/landing/HowItWorksSection';
import FeaturesChecklist from '@/components/landing/FeaturesChecklist';
import MotivationSection from '@/components/landing/MotivationSection';
import SupportBlocks from '@/components/landing/SupportBlocks';
import FAQAccordion from '@/components/landing/FAQAccordion';
import TutorBanner from '@/components/landing/TutorBanner';
import CredibilityStrip from '@/components/landing/CredibilityStrip';
import FooterLinks from '@/components/landing/FooterLinks';
import Footer from '@/components/landing/Footer';
import { getFeaturedTutors } from '@/lib/services/landingTutorsService';

export const revalidate = 300; // Revalidate every 5 minutes

export default async function HomePage() {
  const tutors = await getFeaturedTutors();

  return (
    <div className="relative min-h-screen">
      <Header />
      <main>
        <Hero />
        <FeaturedTutors tutors={tutors} />
        <HowItWorksSection />
        <FeaturesChecklist />
        <MotivationSection />
        <SupportBlocks />
        <FAQAccordion />
        <TutorBanner />
        <CredibilityStrip />
        <FooterLinks />
      </main>
      <Footer />
    </div>
  );
}

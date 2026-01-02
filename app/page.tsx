import Header from '@/components/landing/Header';
import Hero from '@/components/landing/Hero';
import FeaturedCarousel from '@/components/landing/FeaturedCarousel';
import SubjectPills from '@/components/landing/SubjectPills';
import HowItWorksSection from '@/components/landing/HowItWorksSection';
import FeaturesChecklist from '@/components/landing/FeaturesChecklist';
import SuccessStories from '@/components/landing/SuccessStories';
import MotivationSection from '@/components/landing/MotivationSection';
import SupportBlocks from '@/components/landing/SupportBlocks';
import FAQAccordion from '@/components/landing/FAQAccordion';
import TutorBanner from '@/components/landing/TutorBanner';
import CredibilityStrip from '@/components/landing/CredibilityStrip';
import FooterLinks from '@/components/landing/FooterLinks';
import Footer from '@/components/landing/Footer';

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-itutor-black">
      <Header />
      <main>
        <Hero />
        <FeaturedCarousel />
        <SubjectPills />
        <HowItWorksSection />
        <FeaturesChecklist />
        <SuccessStories />
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

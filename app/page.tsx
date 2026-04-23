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
    <div className="relative min-h-screen overflow-x-hidden bg-[#eafff1]">
      {/* Ambient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-float absolute -left-[100px] -top-[100px] h-[500px] w-[500px] rounded-full bg-[#4ade80] opacity-55 blur-[80px]" />
        <div className="animate-float absolute -right-[200px] top-[30%] h-[600px] w-[600px] rounded-full bg-[#86efac] opacity-55 blur-[80px]" style={{ animationDelay: '-5s' }} />
        <div className="animate-float absolute -bottom-[100px] left-[20%] h-[450px] w-[450px] rounded-full bg-[#22c55e] opacity-40 blur-[80px]" style={{ animationDelay: '-10s' }} />
        <div className="animate-float absolute left-[10%] top-[60%] h-[400px] w-[400px] rounded-full bg-[#bbf7d0] opacity-55 blur-[80px]" style={{ animationDelay: '-15s' }} />
      </div>

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

import Nav from '@/components/landing/Nav';
import ClassMatchBanner from '@/components/ClassMatchBanner';
import Hero from '@/components/landing/Hero';
import Stats from '@/components/landing/Stats';
import Testimonials from '@/components/landing/Testimonials';
import HowItWorks from '@/components/landing/HowItWorks';
import CtaBand from '@/components/landing/CtaBand';
import Footer from '@/components/landing/Footer';

export const revalidate = 300;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Client component that renders null until its fetch resolves — the ISR
          render of this page is unchanged when no campaign is live. The margin
          clears the fixed landing Nav (py-3 + h-12 logo = 72px, py-4 = 80px sm),
          which is out of normal flow and would otherwise cover the bar. */}
      <ClassMatchBanner className="mt-[73px] sm:mt-[81px]" />
      <Nav />
      <Hero />
      <Stats />
      <Testimonials />
      <HowItWorks />
      <CtaBand />
      <Footer />
    </main>
  );
}

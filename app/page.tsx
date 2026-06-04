import Nav from '@/components/landing/Nav';
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

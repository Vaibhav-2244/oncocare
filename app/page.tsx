import { Navbar } from '@/components/sections/navbar';
import { Hero } from '@/components/sections/hero';
import { TrustedBy } from '@/components/sections/trusted-by';
import { Problem } from '@/components/sections/problem';
import { Solution } from '@/components/sections/solution';
import { Features } from '@/components/sections/features';
import { AISection } from '@/components/sections/ai-section';
import { HowItWorks } from '@/components/sections/how-it-works';
import { WhyOncoCare } from '@/components/sections/why-oncocare';
import { ForHospitals } from '@/components/sections/for-hospitals';
import { Testimonials } from '@/components/sections/testimonials';
import { Statistics } from '@/components/sections/statistics';
import { FAQ } from '@/components/sections/faq';
import { CTA } from '@/components/sections/cta';
import { Footer } from '@/components/sections/footer';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustedBy />
        <Problem />
        <Solution />
        <Features />
        <AISection />
        <HowItWorks />
        <WhyOncoCare />
        <ForHospitals />
        <Testimonials />
        <Statistics />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

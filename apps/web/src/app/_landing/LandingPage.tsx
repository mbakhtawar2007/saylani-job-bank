'use client';

import { CTABanner } from '@/components/organisms/CTABanner';
import { FAQSection } from '@/components/organisms/FAQSection';
import { Footer } from '@/components/organisms/Footer';
import { Navbar } from '@/components/organisms/Navbar';
import { HeroSection } from './components/HeroSection';
import { LatestOpeningsSection } from './components/LatestOpeningsSection';
import { ProcessSection } from './components/ProcessSection';
import { StoriesSection } from './components/StoriesSection';
import { ValuePropBanner } from './components/ValuePropBanner';

interface LandingPageProps {
  signedIn?: boolean;
  dashboardHref?: string;
}

export default function LandingPage({
  signedIn = false,
  dashboardHref = '/login',
}: LandingPageProps) {
  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-[#F9F9F9] text-black">
      {/* Subtle ambient lighting for enhanced visual depth */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[600px] w-full max-w-7xl -translate-x-1/2 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(140,198,65,0.12),rgba(255,255,255,0))] select-none" />
      <div className="pointer-events-none absolute top-[35%] -right-40 -z-10 size-[500px] rounded-full bg-[#8CC641]/5 blur-3xl select-none" />
      <div className="pointer-events-none absolute top-[65%] -left-40 -z-10 size-[500px] rounded-full bg-[#8CC641]/5 blur-3xl select-none" />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-16 pt-10 lg:gap-[100px]">
        <Navbar signedIn={signedIn} dashboardHref={dashboardHref} />
        <HeroSection />
        <ValuePropBanner />
        <ProcessSection />
        <LatestOpeningsSection />
        <StoriesSection />
        <FAQSection />
        <CTABanner />
        <Footer />
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { CTABanner } from '@/components/organisms/CTABanner';
import { Footer } from '@/components/organisms/Footer';
import { Navbar } from '@/components/organisms/Navbar';
import { StoriesSection } from '../_landing/components/StoriesSection';
import { AboutHero } from './components/AboutHero';
import { AboutLeadership } from './components/AboutLeadership';
import { AboutMetrics } from './components/AboutMetrics';
import { AboutShowcase } from './components/AboutShowcase';
import { AboutStory } from './components/AboutStory';
import { AboutValues } from './components/AboutValues';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Saylani Job Bank - Every skill deserves a job. A service of Saylani Welfare International Trust.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#F9F9F9] text-[#000000]">
      <Navbar />
      <AboutHero />
      <AboutMetrics />
      <AboutStory />
      <AboutValues />
      <AboutLeadership />
      <AboutShowcase />
      <StoriesSection />
      <CTABanner />
      <Footer />
    </div>
  );
}

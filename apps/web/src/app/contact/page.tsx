import type { Metadata } from 'next';
import { CTABanner } from '@/components/organisms/CTABanner';
import { Footer } from '@/components/organisms/Footer';
import { ContactFAQ } from './components/ContactFAQ';
import { ContactFormSection } from './components/ContactFormSection';
import { ContactHero } from './components/ContactHero';
import { ContactSupportCards } from './components/ContactSupportCards';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Saylani Job Bank - We’re Here to Help. Contact our Karachi Clifton branch and nationwide support team.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen w-full bg-[#F9F9F9] text-black">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-16 pt-10 lg:gap-[100px]">
        <ContactHero />
        <ContactFormSection />
        <ContactSupportCards />
        <ContactFAQ />
        <CTABanner />
        <Footer />
      </div>
    </div>
  );
}

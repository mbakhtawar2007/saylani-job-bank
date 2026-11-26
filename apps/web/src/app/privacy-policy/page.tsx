import type { Metadata } from 'next';
import { CTABanner } from '@/components/organisms/CTABanner';
import { Footer } from '@/components/organisms/Footer';
import { Navbar } from '@/components/organisms/Navbar';
import { PRIVACY_SECTIONS } from './privacyData';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Saylani Job Bank official Privacy Policy and candidate data protections.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#F9F9F9] text-black">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-16 pt-10 lg:gap-[100px]">
        <Navbar />

        <main className="flex flex-col gap-[60px]">
          <header className="w-full px-4 md:px-[60px]">
            <h1 className="text-[40px] leading-[1.2] font-semibold text-black sm:text-[54px] sm:leading-[76px]">
              Privacy Policy
            </h1>
          </header>

          {PRIVACY_SECTIONS.map((sec) => (
            <section key={sec.title} className="w-full px-4 py-10 md:px-[60px]">
              <div className="mx-auto flex max-w-[1320px] flex-col items-center gap-10">
                <div className="rounded-[12px] px-3.5 py-2">
                  <h2 className="text-center text-[26px] leading-[32px] font-semibold text-black sm:text-[32px]">
                    {sec.title}
                  </h2>
                </div>

                <div className="w-full space-y-4 text-left text-[16px] leading-[24px] font-normal text-black sm:text-[20px] sm:leading-[26px]">
                  {sec.paragraphs.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}

                  {sec.bullets && (
                    <ul className="list-disc space-y-2 pl-6">
                      {sec.bullets.map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>
                  )}

                  {sec.subsections?.map((sub) => (
                    <div key={sub.title} className="space-y-2 pt-2">
                      <p className="font-semibold text-black">{sub.title}</p>
                      <ul className="list-disc space-y-2 pl-6">
                        {sub.bullets.map((b, idx) => (
                          <li key={idx}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}

          <CTABanner />
        </main>

        <Footer />
      </div>
    </div>
  );
}

import { ArrowRight } from 'lucide-react';
import NextLink from 'next/link';

const CARDS = [
  {
    title: 'Applicant Support',
    cta: 'Get Applicant Support',
    href: '/jobs',
  },
  {
    title: 'Employer Support',
    cta: 'Get Employer Support',
    href: '/contact',
  },
];

export function ContactSupportCards() {
  return (
    <section className="w-full px-4 py-10 md:px-[60px]">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-5 lg:flex-row">
        {CARDS.map((card) => (
          <div
            key={card.title}
            className="flex w-full flex-col justify-center gap-5 rounded-[34px] bg-white p-6 sm:p-10 lg:max-w-[650px]"
          >
            <div className="flex flex-col gap-5">
              <h3 className="text-[28px] leading-[32px] font-normal text-black sm:text-[32px]">
                {card.title}
              </h3>
              <p className="max-w-[585px] text-[16px] leading-[16px] font-medium text-black">
                Need help with your profile, documents, or job application? We&apos;re here to guide
                you.
              </p>
            </div>
            <div>
              <NextLink
                href={card.href}
                className="inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-black px-4 text-[18px] leading-[20px] font-medium text-white transition-colors hover:bg-neutral-800 sm:text-[20px]"
              >
                {card.cta}
                <ArrowRight className="size-6" strokeWidth={1.8} />
              </NextLink>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

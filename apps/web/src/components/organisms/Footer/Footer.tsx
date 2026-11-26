import NextLink from 'next/link';
import { BrandMark } from '@/components/brands/BrandMark';

const COLUMNS = [
  {
    title: 'Explore',
    items: [
      { label: 'Home', href: '/' },
      { label: 'About Us', href: '/about' },
      { label: 'Jobs', href: '/jobs' },
      { label: 'Contact Us', href: '/contact' },
    ],
  },
  {
    title: 'For You',
    items: [
      { label: 'Job Seekers', href: '/jobs' },
      { label: 'Employers', href: '/contact' },
      { label: 'Latest Opening', href: '/jobs' },
    ],
  },
  {
    title: 'Contact',
    items: [
      { label: '+1 (929) 922-6467', href: 'tel:+19299226467' },
      { label: 'info@saylanibank.com', href: 'mailto:info@saylanibank.com' },
      { label: 'A-25, off Bahadur Shah Zafar Road,', href: '#' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="w-full overflow-hidden bg-white">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-10 px-4 pt-12 md:px-0">
        <div className="flex flex-col gap-10 border-b border-black/10 pb-10 lg:flex-row lg:justify-between">
          <div className="flex max-w-[519px] flex-col gap-10">
            <div className="flex flex-col gap-6">
              <NextLink href="/" className="inline-block transition-opacity hover:opacity-90">
                <BrandMark />
              </NextLink>
              <p className="max-w-[519px] text-[18px] leading-[24px] font-normal text-black">
                A free employment service of Saylani Welfare International Trust, connecting skilled
                people with employers.
              </p>
            </div>
            <div>
              <a
                href="https://www.saylaniwelfare.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-[52px] items-center justify-center rounded-full bg-black px-6 text-[16px] leading-[22px] font-medium text-white transition-colors hover:bg-neutral-800"
              >
                Support Saylani
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-10 sm:flex-row sm:gap-20">
            {COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-6">
                <h3 className="text-[18px] leading-[24px] font-normal text-black">{col.title}</h3>
                <ul className="flex flex-col gap-3">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      <NextLink
                        href={item.href}
                        className="text-[16px] leading-[24px] font-normal text-black/60 transition-colors hover:text-[#8CC641]"
                      >
                        {item.label}
                      </NextLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-[16px] leading-[24px] font-normal text-black/60">
            2025 Saylani Job Bank all rights reserved.
          </p>
          <div className="flex items-center gap-2 text-[16px] leading-[22px]">
            <NextLink
              href="/privacy-policy"
              className="text-[#65748B] transition-colors hover:text-black"
            >
              Privacy Policy
            </NextLink>
            <span className="size-1 rounded-full bg-[#65748B]" />
            <NextLink href="/terms" className="text-[#65748B] transition-colors hover:text-black">
              Terms of Use
            </NextLink>
          </div>
        </div>

        <div className="pointer-events-none -mb-2 overflow-hidden text-center select-none">
          <span className="block text-[52px] leading-none font-extrabold tracking-tight whitespace-nowrap text-[#8CC641]/60 uppercase sm:text-[100px] lg:text-[150px] lg:leading-[210px]">
            SAYLANI JOB BANK
          </span>
        </div>
      </div>
    </footer>
  );
}

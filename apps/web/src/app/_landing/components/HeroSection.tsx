'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { HeroSearch } from '@/components/molecules/HeroSearch';
import { HeroGraphicCard } from './HeroGraphicCard';

const PARTNERS = [
  { src: '/assets/Vector_107_2802.png', w: 82, h: 82, alt: 'Partner 1' },
  { src: '/assets/partner-logo-1.png', w: 183, h: 41, alt: 'BNP Paribas' },
  { src: '/assets/Vector_107_2813.png', w: 195, h: 61, alt: 'Partner 2' },
  { src: '/assets/partner-logo-2.png', w: 131, h: 38, alt: 'BPI France' },
];

export function HeroSection() {
  return (
    <section className="w-full px-4 md:px-[60px]">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-8">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex w-full max-w-[754px] flex-col gap-11"
          >
            <div className="flex flex-col gap-6">
              <h1 className="max-w-[738px] text-[36px] leading-[1.18] font-semibold text-black sm:text-[44px] lg:text-[54px] lg:leading-[76px]">
                Connecting skilled people with the jobs that need them.
              </h1>
              <p className="max-w-[597px] text-[16px] leading-[22px] font-medium text-black/60">
                Register, get your skills assessed, and be matched with employers who are hiring.
                Always free for job seekers and employers.
              </p>
            </div>
            <HeroSearch />
          </motion.div>

          <div className="w-full max-w-[534px] shrink-0">
            <HeroGraphicCard />
          </div>
        </div>

        <div className="flex flex-col gap-6 border-t border-black/5 pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[24px] leading-[34px] font-normal text-black">Our partners</p>
            <p className="text-[18px] leading-[25px] font-normal text-black/60">
              The companies we&apos;ve helped succeed
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-10 opacity-90 lg:gap-[63px]">
            {PARTNERS.map((p) => (
              <motion.div key={p.alt} whileHover={{ scale: 1.06 }} transition={{ duration: 0.2 }}>
                <Image
                  src={p.src}
                  alt={p.alt}
                  width={p.w}
                  height={p.h}
                  className="h-auto max-h-[82px] w-auto object-contain"
                />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

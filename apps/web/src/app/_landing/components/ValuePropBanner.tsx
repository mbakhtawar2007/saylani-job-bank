'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

export function ValuePropBanner() {
  return (
    <section className="w-full px-4 py-12 md:px-8 lg:py-16">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center"
        >
          {/* Top Label */}
          <span className="mb-4 text-[15px] leading-none font-medium text-[#8CC641] sm:mb-6 sm:text-[16px]">
            About
          </span>

          {/* Heading with inline tilted badge icons matching Figma design */}
          <h2 className="max-w-[980px] text-center font-['Serotiva',sans-serif] text-[26px] leading-[1.35] font-normal text-[#7E7E7E] sm:text-[36px] sm:leading-[1.3] lg:text-[46px] lg:leading-[1.35]">
            <motion.span
              whileHover={{ scale: 1.08, rotate: -5 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="mr-3 inline-flex size-11 -rotate-[14deg] items-center justify-center rounded-xl bg-white p-2 align-middle shadow-[0_8px_24px_rgba(0,0,0,0.08)] select-none sm:mr-4 sm:size-14 sm:rounded-2xl lg:size-16"
            >
              <Image
                src="/assets/icons/about-profile-2user.svg"
                alt="Saylani Job Bank Community"
                width={40}
                height={40}
                className="size-7 object-contain sm:size-9 lg:size-10"
                unoptimized
              />
            </motion.span>
            A <span className="font-semibold text-black">free employment service</span> by Saylani
            <br className="hidden md:inline" /> Welfare. We match{' '}
            <span className="font-semibold text-black">skilled people</span> with
            <br className="hidden md:inline" />{' '}
            <span className="font-semibold text-black">employers</span> who are{' '}
            <span className="font-semibold text-black">hiring.</span>
            <motion.span
              whileHover={{ scale: 1.08, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="ml-3 inline-flex size-11 -rotate-[10deg] items-center justify-center rounded-xl bg-white p-2 align-middle shadow-[0_8px_24px_rgba(0,0,0,0.08)] select-none sm:ml-4 sm:size-14 sm:rounded-2xl lg:size-16"
            >
              <Image
                src="/assets/icons/about-collaboration.svg"
                alt="Saylani Job Bank Collaboration"
                width={40}
                height={32}
                className="h-auto w-7 object-contain sm:w-9 lg:w-10"
                unoptimized
              />
            </motion.span>
          </h2>
        </motion.div>
      </div>
    </section>
  );
}

'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Navbar } from '@/components/organisms/Navbar';

export function ContactHero() {
  return (
    <section className="w-full px-4 md:px-[60px]">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-[60px]">
        <Navbar className="px-0 md:px-0" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
        >
          <h1 className="max-w-[789px] text-[34px] leading-[1.15] font-bold tracking-[-1px] text-black sm:text-[46px] lg:text-[58px] lg:leading-[67px]">
            We&apos;re Here to Help.
          </h1>
          <div className="flex w-full max-w-[385px] flex-col gap-6">
            <p className="text-[16px] leading-[22px] font-medium text-black">
              Have a question, need assistance, or want to connect with our team? Reach out to us,
              and we&apos;ll help you find the right direction.
            </p>
            <a
              href="#message-form"
              className="inline-flex h-[38px] w-fit items-center justify-center rounded-full bg-[#8CC641] px-4 text-[16px] leading-[22px] font-medium text-white transition-colors hover:bg-[#7CB337]"
            >
              Contact us
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative aspect-[1314/517] w-full overflow-hidden rounded-[28px] bg-neutral-900"
        >
          <Image
            src="/assets/Rectangle_17_50_5906.png"
            alt="Saylani support team at the helpdesk"
            fill
            priority
            sizes="1320px"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/30" />
        </motion.div>
      </div>
    </section>
  );
}

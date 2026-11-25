'use client';

import { motion } from 'framer-motion';
import { Brush, Building2, Monitor, PaintBucket, Stethoscope, Wrench } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';

const ICONS = [Monitor, Stethoscope, Building2, Brush, PaintBucket, Wrench];

export function CTABanner() {
  return (
    <section className="w-full px-4 md:px-[60px]">
      <div className="mx-auto max-w-[1320px]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[34px] bg-[#8CC641]"
        >
          <span className="pointer-events-none absolute -top-56 -left-28 size-[900px] rounded-full border border-white/25" />
          <span className="pointer-events-none absolute -top-56 -left-28 size-[900px] rounded-full bg-[#9FD45A]/40" />

          <div className="relative z-10 flex w-full max-w-[721px] flex-col gap-6 px-6 pt-10 pb-10 sm:px-[61px] sm:pt-[79px]">
            <div className="flex flex-col gap-4">
              <h2 className="text-[34px] leading-[1.2] font-semibold text-white sm:text-[54px] sm:leading-[76px]">
                Find your next job or great hire at the Job Bank.
              </h2>
              <p className="max-w-[597px] text-[16px] leading-[22px] font-medium text-white">
                Job seekers can register for free and get matched with employers who are hiring.
                Employers can post a vacancy at no cost and meet skilled, verified candidates.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <NextLink
                  href="/jobs"
                  className="inline-flex h-[52px] items-center justify-center rounded-full bg-black px-6 text-[16px] leading-[22px] font-medium text-white transition-colors hover:bg-neutral-800"
                >
                  Find a Job
                </NextLink>
              </motion.div>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <NextLink
                  href="/contact"
                  className="inline-flex h-[52px] items-center justify-center rounded-full bg-white px-6 text-[16px] leading-[22px] font-medium text-black/60 transition-colors hover:text-black"
                >
                  Hire talent
                </NextLink>
              </motion.div>
            </div>
          </div>

          <div className="pointer-events-none absolute top-1/2 -right-2 hidden -translate-y-1/2 flex-col gap-3 sm:flex">
            {ICONS.map((Icon, i) => (
              <span
                key={i}
                className="flex size-14 items-center justify-center rounded-[10px] bg-[#F9F9F9] text-[#10261A] shadow-sm"
              >
                <Icon className="size-7" strokeWidth={1.6} />
              </span>
            ))}
          </div>

          <div className="pointer-events-none absolute right-[40px] bottom-0 hidden w-[326px] sm:block">
            <Image
              src="/assets/image_43_107_3159.png"
              alt="Verified candidate"
              width={326}
              height={466}
              className="h-auto w-full object-contain object-bottom"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

export function AboutStory() {
  return (
    <section className="overflow-hidden bg-[#F9F9F9] py-16 sm:py-24">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        {/* Mission Statement Quote Banner from Figma */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-[1050px] text-center"
        >
          <h2 className="text-center font-['Serotiva',sans-serif] text-[26px] leading-[1.35] font-normal text-[#7E7E7E] sm:text-[36px] sm:leading-[1.3] lg:text-[46px] lg:leading-[1.35]">
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
            We exist to <span className="font-semibold text-black">Reduce unemployment</span> by
            <br className="hidden md:inline" /> matching{' '}
            <span className="font-semibold text-black">Skilled people</span> with the
            <br className="hidden md:inline" />{' '}
            <span className="font-semibold text-black">Employers</span> who need them.
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

        {/* 2-Column: A service of Saylani Welfare International Trust */}
        <div className="mt-20 grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
          {/* Left Text */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-6"
          >
            <h3 className="text-3xl leading-tight font-semibold text-black sm:text-[32px]">
              A service of Saylani Welfare International Trust
            </h3>
            <p className="mt-5 text-base leading-relaxed font-medium text-black/80">
              The Job Bank is part of Saylani Welfare’s social welfare work, helping people move
              from need toward a steady livelihood. Where the Trust provides relief, the Job Bank
              provides a way forward.
            </p>

            <div className="mt-8">
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="https://www.saylaniwelfare.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-black px-8 py-3.5 text-lg font-medium text-white shadow-sm transition-all hover:bg-neutral-800"
              >
                Visit Saylani Welfare
              </motion.a>
            </div>
          </motion.div>

          {/* Right Real Photo from Figma */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            whileHover={{ scale: 1.02 }}
            className="lg:col-span-6"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-gray-200/80 bg-neutral-900 shadow-xl">
              <Image
                src="/assets/about-mentorship.png"
                alt="Saylani Welfare Mentorship and Vocational Guidance"
                fill
                className="object-cover object-center select-none"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

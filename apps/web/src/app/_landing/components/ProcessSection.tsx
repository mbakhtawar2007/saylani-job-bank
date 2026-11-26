'use client';

import { motion } from 'framer-motion';
import { BrandMark } from '@/components/brands/BrandMark';

const STEPS = [
  {
    num: '1',
    title: 'Create your free account',
    desc: 'Register quickly with your phone or email. Secure and free.',
  },
  {
    num: '2',
    title: 'Fill your Personal Data',
    desc: 'Complete your registration and prepare your profile for companies.',
  },
  {
    num: '3',
    title: 'Upload your Resume & Credentials',
    desc: 'Upload your CV or let us extract your skills and certifications.',
  },
  {
    num: '4',
    title: 'Get Matched & Secure Rizq',
    desc: 'Find job matches, get interview calls, and begin your career with respect.',
  },
];

export function ProcessSection() {
  return (
    <section className="w-full px-4 md:px-[60px]">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-10 py-6 sm:py-10">
        {/* Section Header */}
        <div className="flex max-w-[700px] flex-col items-center gap-2.5 text-center">
          <span className="text-[15px] leading-none font-medium text-[#8CC641]">Process</span>
          <h2 className="font-['Serotiva',sans-serif] text-[26px] leading-[1.3] font-semibold text-black sm:text-[32px] sm:leading-[1.25]">
            How the Job Bank takes you from
            <br className="hidden sm:inline" /> registration to a job
          </h2>
          <p className="max-w-[620px] text-[14px] leading-relaxed font-normal text-[#787878] sm:text-[15px]">
            Four simple steps for job seekers and for employers. Every candidate is assessed, every
            match is checked, and no fees are charged at any stage.
          </p>
        </div>

        {/* 2-Column Split */}
        <div className="grid w-full grid-cols-1 items-center gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: 4 Step Cards */}
          <div className="flex flex-col gap-3.5 lg:col-span-6">
            {STEPS.map((s, idx) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: idx * 0.08 }}
                whileHover={{ x: 4 }}
                className="group flex cursor-pointer items-center gap-4 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)] transition-all duration-200 hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] sm:p-5"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#555555] text-[14px] font-semibold text-white transition-colors duration-200 group-hover:bg-black sm:size-10">
                  {s.num}
                </div>
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-['Serotiva',sans-serif] text-[16px] font-semibold text-black sm:text-[18px]">
                    {s.title}
                  </h3>
                  <p className="text-[13px] leading-snug font-normal text-[#787878] sm:text-[14px]">
                    {s.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Right Column: Interactive Form Card Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col rounded-[24px] bg-white p-6 shadow-[0_4px_25px_rgba(0,0,0,0.03)] sm:p-9 lg:col-span-6"
          >
            <div className="mb-6 flex justify-center">
              <BrandMark className="h-8 sm:h-9" />
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[14px] font-semibold text-[#111111]">Email</label>
                <input
                  type="email"
                  readOnly
                  value="muneeb@gmail.com"
                  className="h-[48px] w-full rounded-[14px] bg-[#F7F7F7] px-4 text-[14px] text-[#71717A] outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[14px] font-semibold text-[#111111]">Password</label>
                <input
                  type="password"
                  readOnly
                  value="••••••••••••"
                  className="h-[48px] w-full rounded-[14px] bg-[#F7F7F7] px-4 text-[14px] text-[#71717A] outline-none"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                className="mt-2 h-[50px] w-full rounded-full bg-black text-[15px] font-medium text-white transition-colors hover:bg-neutral-800"
              >
                Create Account
              </motion.button>

              <p className="text-center text-[12px] font-normal text-[#8E8E93]">
                Free &amp; secure registration verified by OTP
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

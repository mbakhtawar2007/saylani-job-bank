'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

const FAQS = [
  {
    q: 'Is the Job Bank really free?',
    a: 'Yes, Saylani Job Bank is 100% free for job seekers and employers. We never charge any registration fees or placement commissions.',
  },
  {
    q: 'How does matching work?',
    a: 'We register each applicant and check their education, skills and experience. Eligible candidates are then matched with employers who have posted matching vacancies.',
  },
  {
    q: 'How long does it take to get placed?',
    a: 'Placement timelines depend on demand, your trade qualifications, and interview scheduling, typically ranging from a few days to 2 weeks.',
  },
  {
    q: 'Who can register as a job seeker?',
    a: 'Anyone looking for employment with vocational skills, trade certificates, or academic diplomas can register.',
  },
  {
    q: 'What documents do I need to register?',
    a: 'A valid CNIC or Form-B, your latest resume or educational credentials, and any relevant trade certificates.',
  },
  {
    q: 'How do employers post a vacancy?',
    a: 'Employers register their organization, verify their business profile, and can post vacancies immediately at zero cost.',
  },
];

export function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(1);

  return (
    <section className="w-full px-4 md:px-[60px]">
      <div className="mx-auto flex max-w-[1320px] flex-col items-center gap-10 py-6 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
          className="flex max-w-[705px] flex-col items-center gap-3 text-center"
        >
          <span className="text-[16px] leading-[22px] font-medium text-[#8CC641]">Faq</span>
          <h2 className="text-[28px] leading-[1.25] font-semibold text-black sm:text-[38px] sm:leading-[50px]">
            Common questions from job seekers and employers
          </h2>
          <p className="text-[16px] leading-relaxed font-normal text-[#787878] sm:text-[18px]">
            Find quick answers about registration, matching and fees, or contact our team if you
            can’t find what you need.
          </p>
        </motion.div>

        <div className="flex w-full flex-col gap-3.5">
          {FAQS.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className={`overflow-hidden rounded-[14px] border border-black/5 bg-white transition-all duration-200 hover:shadow-xs ${
                  isOpen ? 'shadow-xs ring-1 ring-[#8CC641]/30' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  style={{ fontFamily: 'var(--font-manrope), sans-serif' }}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4.5 text-left text-[17px] font-medium text-black transition-colors hover:text-[#5E9523] sm:text-[18px]"
                >
                  <span className={isOpen ? 'font-semibold text-[#0C1812]' : 'text-black'}>
                    {item.q}
                  </span>
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                      isOpen ? 'bg-[#8CC641] text-white' : 'bg-[#F4F5F2] text-black/70'
                    }`}
                  >
                    {isOpen ? (
                      <Minus className="size-4.5 stroke-[2.5]" />
                    ) : (
                      <Plus className="size-4.5 stroke-[2.5]" />
                    )}
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p
                        style={{ fontFamily: 'var(--font-manrope), sans-serif' }}
                        className="px-5 pb-5 text-[15px] leading-relaxed text-[#596B63] sm:text-[16px]"
                      >
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

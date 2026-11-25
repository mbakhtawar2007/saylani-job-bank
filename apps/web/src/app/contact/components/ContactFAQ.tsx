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

export function ContactFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(1);

  return (
    <section className="w-full px-4 py-10 md:px-[60px]">
      <div className="mx-auto flex max-w-[1320px] flex-col items-center gap-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex max-w-[705px] flex-col items-center gap-4 text-center"
        >
          <span className="text-[16px] leading-[22px] font-normal text-[#8CC641]">Faq</span>
          <h2 className="text-[30px] leading-[1.25] font-normal text-black sm:text-[40px] sm:leading-[56px]">
            Common questions from job seekers and employers
          </h2>
          <p className="text-[18px] leading-[1.4] font-normal text-black/60 sm:text-[22px] sm:leading-[32px]">
            Find quick answers about registration, matching and fees, or contact our team if you
            can’t find what you need.
          </p>
        </motion.div>

        <div className="flex w-full flex-col gap-4">
          {FAQS.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={item.q} className="overflow-hidden rounded-[12px] bg-white">
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-[18px] leading-[24px] font-normal text-black transition-colors hover:text-[#8CC641]"
                >
                  <span>{item.q}</span>
                  {isOpen ? (
                    <Minus className="size-5 shrink-0 text-black" />
                  ) : (
                    <Plus className="size-5 shrink-0 text-black/60" />
                  )}
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
                      <p className="px-4 pb-4 text-[16px] leading-[24px] font-normal text-black/60">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Search } from 'lucide-react';
import NextLink from 'next/link';
import { useState } from 'react';
import { OPENINGS, TABS } from './openingsData';

export function LatestOpeningsSection() {
  const [activeTab, setActiveTab] = useState('All roles');
  const [query, setQuery] = useState('');

  const filtered = OPENINGS.filter((job) => {
    if (activeTab !== 'All roles' && job.category !== activeTab) return false;
    if (query && !job.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <section className="w-full px-4 md:px-[60px]">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-1"
        >
          <h2 className="text-[28px] leading-[1.2] font-semibold text-black sm:text-[32px] sm:leading-[45px]">
            Latest openings
          </h2>
          <p className="text-[16px] leading-[22px] font-medium text-black/60">
            Roles posted by employers across different industries and skill levels.
          </p>
        </motion.div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex h-12 w-full max-w-[711px] items-center gap-2 rounded-full border border-black/5 bg-white px-3.5 shadow-xs transition-shadow focus-within:border-[#8CC641] focus-within:shadow-sm">
            <Search className="size-5 shrink-0 text-[#54614F]" strokeWidth={1.8} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Job title or skill"
              className="w-full bg-transparent text-[16px] leading-[22px] text-black placeholder:text-black/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => (
              <motion.button
                key={tab}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setActiveTab(tab)}
                className={`relative h-9 rounded-full px-4 text-[15px] whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab
                    ? 'bg-black font-medium text-white shadow-xs'
                    : 'bg-white text-[#54614F] shadow-xs hover:bg-[#F2F5EE] hover:text-black'
                }`}
              >
                {tab}
              </motion.button>
            ))}
          </div>
        </div>

        <motion.div
          layout
          className="mt-2 overflow-hidden rounded-[24px] border border-black/5 bg-white shadow-xs"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((job) => (
              <motion.div
                key={job.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <NextLink
                  href="/jobs"
                  className="group flex flex-col justify-between gap-3 border-b border-[#E6ECDE] px-7 py-5.5 transition-all duration-200 last:border-b-0 hover:bg-[#F8FAF4] sm:flex-row sm:items-center"
                >
                  <div className="flex flex-col gap-2 transition-transform duration-200 group-hover:translate-x-1">
                    <h3 className="text-[19px] font-semibold tracking-[-0.2px] text-black transition-colors group-hover:text-[#6FA82E]">
                      {job.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      {job.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex h-7 items-center rounded-full bg-[#F4F5F2] px-3 text-[13px] font-medium text-black/70 transition-colors group-hover:bg-white"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[17px] font-semibold text-[#10261A]">{job.salary}</p>
                    <p className="text-[13px] text-[#54614F]">per month</p>
                  </div>
                </NextLink>
              </motion.div>
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <p className="px-7 py-12 text-center text-[16px] text-black/60">No openings found.</p>
          )}
        </motion.div>

        <div className="flex justify-center pt-2">
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <NextLink
              href="/jobs"
              className="inline-flex h-[52px] items-center gap-2 rounded-full bg-[#8CC641] px-6 text-[15px] font-semibold text-white shadow-xs transition-colors hover:bg-[#7CB337]"
            >
              View all openings
              <ArrowRight className="size-[18px]" strokeWidth={2} />
            </NextLink>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

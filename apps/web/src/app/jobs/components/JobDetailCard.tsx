'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Banknote, Bookmark, Briefcase, MapPin, Share2 } from 'lucide-react';
import type { JobSummary } from '../data';

interface JobDetailCardProps {
  job: JobSummary;
}

const META = [
  { key: 'salary', Icon: Banknote },
  { key: 'type', Icon: Briefcase },
  { key: 'location', Icon: MapPin },
] as const;

export function JobDetailCard({ job }: JobDetailCardProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={job.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="flex w-full flex-col gap-6 rounded-[12px] bg-white p-5 lg:max-w-[760px] lg:p-6"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-[32px] leading-[30px] font-normal text-black">{job.title}</h2>
            <p className="text-[16px] leading-[24px] font-normal text-black/60">
              {job.company ? `${job.company} · ` : ''}
              {job.location}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="inline-flex h-[33px] items-center rounded-[8.7px] bg-black px-3 text-[14px] leading-[18px] font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Apply now
            </button>
            <button
              type="button"
              aria-label="Save job"
              className="flex size-8 items-center justify-center text-black/60 transition-colors hover:text-black"
            >
              <Bookmark className="size-5" strokeWidth={1.7} />
            </button>
            <button
              type="button"
              aria-label="Share job"
              className="flex size-8 items-center justify-center text-black/60 transition-colors hover:text-black"
            >
              <Share2 className="size-5" strokeWidth={1.7} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-[20px] leading-[28px] font-medium text-[#0D0D0D]">Job details</h3>
          <div className="flex flex-col gap-2">
            {META.map(({ key, Icon }) => (
              <p
                key={key}
                className="flex items-center gap-2 text-[16px] leading-[24px] font-normal text-black/80"
              >
                <Icon className="size-[18px] shrink-0 text-[#8CC641]" strokeWidth={1.8} />
                <span>{job[key]}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <h3 className="text-[20px] leading-[30px] font-medium text-[#2D2D2D]">
            Full job description
          </h3>
          <p className="max-w-[568px] text-[16px] leading-[24px] font-normal text-[#595959]">
            {job.description}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <h3 className="text-[16px] leading-[24px] font-normal text-black">
            Key Responsibilities
          </h3>
          <ul className="flex flex-col gap-3">
            {job.responsibilities.map((item, i) => (
              <li key={i} className="text-[16px] leading-[24px] font-normal text-black/60">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

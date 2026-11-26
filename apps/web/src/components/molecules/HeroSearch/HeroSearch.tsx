'use client';

import { Search } from 'lucide-react';

interface HeroSearchProps {
  className?: string;
}

export function HeroSearch({ className }: HeroSearchProps) {
  return (
    <div
      className={`flex w-full max-w-[630px] flex-col gap-2 rounded-[24px] bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] sm:flex-row sm:items-center sm:gap-1.5 sm:rounded-full ${className ?? ''}`}
    >
      <div className="flex flex-1 items-center gap-3 py-2 pr-2 pl-3">
        <Search className="size-5 shrink-0 text-[#54614F]" strokeWidth={1.8} />
        <input
          type="text"
          placeholder="Job title or skill"
          className="w-full min-w-0 bg-transparent text-[16px] leading-[22px] text-[#10261A] placeholder:text-[#6B7866] focus:outline-none"
        />
      </div>

      <div className="hidden h-7 w-px shrink-0 bg-black/10 sm:block" />

      <div className="flex items-center px-3 py-2">
        <select
          aria-label="City"
          className="cursor-pointer bg-transparent text-[16px] leading-[22px] font-normal text-[#10261A] focus:outline-none"
        >
          <option value="All cities">All cities</option>
          <option value="Karachi">Karachi</option>
          <option value="Lahore">Lahore</option>
          <option value="Islamabad">Islamabad</option>
          <option value="Faisalabad">Faisalabad</option>
        </select>
      </div>

      <button
        type="button"
        className="inline-flex h-[52px] shrink-0 items-center justify-center rounded-full bg-black px-6 text-[16px] leading-[22px] font-medium text-white transition-all hover:bg-neutral-800 active:scale-[0.98]"
      >
        Search jobs
      </button>
    </div>
  );
}

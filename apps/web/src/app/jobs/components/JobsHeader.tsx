import { ChevronDown, Search } from 'lucide-react';
import { CITIES } from '../data';

interface JobsHeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCity: string;
  setSelectedCity: (city: string) => void;
}

export function JobsHeader({
  searchQuery,
  setSearchQuery,
  selectedCity,
  setSelectedCity,
}: JobsHeaderProps) {
  return (
    <section className="w-full px-4 py-10 md:px-[60px]">
      <div className="mx-auto flex max-w-[1320px] flex-col items-start justify-between gap-6 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex w-full max-w-[789px] flex-col gap-2.5">
          <h1 className="text-[34px] leading-[1.15] font-bold tracking-[-1px] text-black sm:text-[46px] lg:text-[58px] lg:leading-[81px]">
            Search latest job posts on Saylani Job Bank
          </h1>
          <p className="max-w-[630px] text-[16px] leading-[22px] font-medium text-black">
            Have a question, need assistance, or want to connect with our team? Reach out to us
            through any of the channels below.
          </p>
        </div>

        <div className="flex h-[62px] w-full max-w-[630px] items-center gap-1.5 rounded-full bg-white p-1.5">
          <span className="flex h-full items-center pl-3">
            <Search className="size-5 text-[#54614F]" strokeWidth={1.7} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Job title or skill"
            className="h-12 min-w-0 flex-1 bg-transparent px-3.5 text-[16px] leading-[22px] text-black placeholder:text-[#6B7866] focus:outline-none"
          />
          <span className="h-7 w-px shrink-0 bg-black/10" />
          <div className="flex h-12 w-[150px] shrink-0 items-center justify-between pl-3.5">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="cursor-pointer appearance-none bg-transparent text-[16px] leading-[22px] text-[#10261A] focus:outline-none"
            >
              {CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <ChevronDown className="size-3 text-[#10261A]" strokeWidth={2} />
          </div>
          <button
            type="button"
            className="h-12 shrink-0 rounded-full bg-black px-[22px] text-[16px] leading-[22px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Search jobs
          </button>
        </div>
      </div>
    </section>
  );
}

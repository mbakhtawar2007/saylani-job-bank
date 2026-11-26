import { Filter } from 'lucide-react';

interface JobsFilterSidebarProps {
  selectedCategories: string[];
  toggleCategory: (cat: string) => void;
  selectedMode: string;
  setSelectedMode: (mode: string) => void;
  selectedExperience: string[];
  toggleExperience: (exp: string) => void;
}

const CATEGORIES = [
  'IT & Software',
  'Trades & Technical',
  'Office & Admin',
  'Healthcare & Nursing',
  'Sales & Marketing',
];

const MODES = ['All modes', 'On-site', 'Remote', 'Hybrid'];

const EXPERIENCES = ['Fresh / 0–1 yr', '1–2 years', '3–5 years', '5+ years'];

export function JobsFilterSidebar({
  selectedCategories,
  toggleCategory,
  selectedMode,
  setSelectedMode,
  selectedExperience,
  toggleExperience,
}: JobsFilterSidebarProps) {
  return (
    <aside className="w-full shrink-0 space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm lg:w-72">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-4">
        <Filter className="size-4 text-[var(--primary)]" />
        <h2 className="text-base font-bold text-black">Filter Openings</h2>
      </div>

      {/* 1. Job Category */}
      <div>
        <h3 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Category</h3>
        <div className="mt-3 space-y-2.5">
          {CATEGORIES.map((cat) => {
            const checked = selectedCategories.includes(cat);
            return (
              <label
                key={cat}
                className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCategory(cat)}
                  className="rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span>{cat}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 2. Work Mode */}
      <div className="border-t border-gray-100 pt-5">
        <h3 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Work Mode</h3>
        <div className="mt-3 space-y-2">
          {MODES.map((mode) => (
            <label
              key={mode}
              className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-gray-700"
            >
              <input
                type="radio"
                name="workMode"
                checked={selectedMode === mode}
                onChange={() => setSelectedMode(mode)}
                className="text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <span>{mode}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 3. Experience */}
      <div className="border-t border-gray-100 pt-5">
        <h3 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Experience</h3>
        <div className="mt-3 space-y-2.5">
          {EXPERIENCES.map((exp) => {
            const checked = selectedExperience.includes(exp);
            return (
              <label
                key={exp}
                className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleExperience(exp)}
                  className="rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span>{exp}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 4. Saylani Guarantee Badge */}
      <div className="rounded-2xl bg-[#F0F7E8] p-4 text-xs text-[#54614F]">
        <p className="font-bold text-[#10261A]">Welfare Guarantee</p>
        <p className="mt-1">
          All postings abide by legal minimum wage standards and zero applicant fee.
        </p>
      </div>
    </aside>
  );
}

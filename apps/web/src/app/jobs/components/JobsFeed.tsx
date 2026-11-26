import { Bookmark } from 'lucide-react';
import type { JobSummary } from '../data';

interface JobsFeedProps {
  jobs: JobSummary[];
  selectedId: string;
  onSelect: (job: JobSummary) => void;
}

export function JobsFeed({ jobs, selectedId, onSelect }: JobsFeedProps) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[536px]">
      {jobs.map((job) => {
        const isSelected = selectedId === job.id;
        return (
          <div
            key={job.id}
            onClick={() => onSelect(job)}
            className={`flex cursor-pointer items-start justify-between gap-4 rounded-[12px] bg-white p-4 transition-shadow ${
              isSelected ? 'ring-2 ring-black/80' : 'hover:shadow-md'
            }`}
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="truncate text-[20px] leading-[28px] font-medium text-black">
                {job.title}
              </h3>
              <p className="truncate text-[14px] leading-[20px] font-normal text-black/60">
                {job.company ? `${job.company} · ` : ''}
                {job.location}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="inline-flex h-7 items-center rounded-full bg-[#F9F9F9] px-3 text-[13px] leading-[18px] font-medium text-black/60">
                  {job.salary}
                </span>
                <span className="inline-flex h-7 items-center rounded-full bg-[#F9F9F9] px-3 text-[13px] leading-[18px] font-medium text-black/60">
                  {job.type}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="flex size-11 shrink-0 items-center justify-center rounded-[12px] text-black/50 transition-colors hover:bg-[#F9F9F9] hover:text-black"
              aria-label="Save job"
              onClick={(e) => e.stopPropagation()}
            >
              <Bookmark className="size-6" strokeWidth={1.6} />
            </button>
          </div>
        );
      })}
      {jobs.length === 0 && (
        <div className="rounded-[12px] bg-white p-8 text-center text-[16px] text-black/60">
          No jobs match your search.
        </div>
      )}
    </div>
  );
}

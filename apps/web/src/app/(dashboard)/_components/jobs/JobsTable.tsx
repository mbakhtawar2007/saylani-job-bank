'use client';

import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_TYPES,
  JOB_TYPE_LABELS,
  SHIFT_TYPES,
  SHIFT_TYPE_LABELS,
  type JobType,
  type PaginationMeta,
  type ShiftType,
} from '@jobbank/shared';
import { Briefcase, Funnel } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Link, Select } from '@/components/atoms';
import { EmptyState, Pagination, SearchBar } from '@/components/molecules';
import type { SelectOption } from '@/components/atoms';
import type { JobListItem } from '@/domains/job';
import { formatDate } from '@/lib/format/date';

const STATUS_BADGE: Record<
  string,
  { tone: 'success' | 'danger' | 'warning' | 'neutral' | 'info' }
> = {
  DRAFT: { tone: 'neutral' },
  OPEN: { tone: 'success' },
  PAUSED: { tone: 'warning' },
  FILLED: { tone: 'success' },
  CLOSED: { tone: 'neutral' },
  EXPIRED: { tone: 'danger' },
};

const FILTER_KEYS = ['status', 'jobType', 'categoryCode', 'cityCode', 'shift'] as const;

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'title:asc', label: 'Title A–Z' },
  { value: 'vacancies:desc', label: 'Most vacancies' },
];

interface Props {
  items: JobListItem[];
  pagination: PaginationMeta;
  categories: SelectOption[];
  cities: SelectOption[];
  basePath: string;
}

export function JobsTable({ items, pagination, categories, cities, basePath }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activeFilters = FILTER_KEYS.filter((key) => params.get(key)).length;
  const hasSearch = Boolean(params.get('q'));
  const [filtersOpen, setFiltersOpen] = useState(activeFilters > 0);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    router.push(`${pathname}?${next.toString()}`);
  };

  const clearFilters = () => {
    const changes: Record<string, string | null> = { q: null };
    for (const key of FILTER_KEYS) changes[key] = null;
    update(changes);
  };

  return (
    <div className="grid w-full gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          className="w-full sm:max-w-xs"
          defaultValue={params.get('q') ?? ''}
          onSearch={(q) => update({ q: q || null })}
          placeholder="Job title, company or keyword…"
          label="Search jobs"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="job-filters"
        >
          <Funnel className="mr-1.5 size-4" aria-hidden="true" />
          Filters
          {activeFilters > 0 && (
            <span className="bg-primary text-primary-fg ms-1.5 grid size-5 place-items-center rounded-full text-xs font-semibold">
              {activeFilters}
            </span>
          )}
        </Button>
        <Select
          aria-label="Sort jobs"
          wrapperClassName="w-full sm:w-44"
          value={params.get('sort') ?? 'createdAt:desc'}
          onChange={(e) => update({ sort: e.target.value })}
          options={SORT_OPTIONS}
        />
        {filtersOpen && (
          <div
            id="job-filters"
            className="border-border bg-surface-muted/50 grid w-full gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <label className="grid gap-1 text-xs font-medium">
              Status
              <Select
                aria-label="Filter by status"
                value={params.get('status') ?? ''}
                onChange={(e) => update({ status: e.target.value || null })}
                placeholder="Any status"
                options={JOB_STATUSES.map((s) => ({ value: s, label: JOB_STATUS_LABELS[s] }))}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Job type
              <Select
                aria-label="Filter by job type"
                value={params.get('jobType') ?? ''}
                onChange={(e) => update({ jobType: e.target.value || null })}
                placeholder="Any type"
                options={JOB_TYPES.map((t) => ({
                  value: t,
                  label: JOB_TYPE_LABELS[t as JobType],
                }))}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Category
              <Select
                aria-label="Filter by category"
                value={params.get('categoryCode') ?? ''}
                onChange={(e) => update({ categoryCode: e.target.value || null })}
                placeholder="Any category"
                options={categories}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              City
              <Select
                aria-label="Filter by city"
                value={params.get('cityCode') ?? ''}
                onChange={(e) => update({ cityCode: e.target.value || null })}
                placeholder="Any city"
                options={cities}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Shift
              <Select
                aria-label="Filter by shift"
                value={params.get('shift') ?? ''}
                onChange={(e) => update({ shift: e.target.value || null })}
                placeholder="Any shift"
                options={SHIFT_TYPES.map((s) => ({
                  value: s,
                  label: SHIFT_TYPE_LABELS[s as ShiftType],
                }))}
              />
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={clearFilters}
                disabled={activeFilters === 0 && !hasSearch}
              >
                Clear all filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={activeFilters > 0 || hasSearch ? 'No jobs match these filters' : 'No jobs yet'}
          description={
            activeFilters > 0 || hasSearch
              ? 'Try clearing the filters or searching by a different title or company.'
              : 'Jobs posted by employers will appear here.'
          }
        />
      ) : (
        <div className="grid gap-3">
          {items.map((job) => {
            const pill = STATUS_BADGE[job.status] ?? { tone: 'neutral' as const };
            const meta = [
              job.companyName,
              job.cityLabel,
              JOB_TYPE_LABELS[job.jobType as JobType],
              `${job.vacancies} ${job.vacancies === 1 ? 'vacancy' : 'vacancies'}`,
              `Posted ${formatDate(job.createdAt)}`,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Link
                key={job.id}
                href={`${basePath}/${job.id}`}
                className="border-border bg-surface hover:bg-surface-muted flex items-center justify-between rounded-xl border px-5 py-4 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Briefcase className="text-fg-muted mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="text-fg font-medium">{job.title}</p>
                    <p className="text-fg-muted text-sm">{meta}</p>
                  </div>
                </div>
                <Badge tone={pill.tone}>{JOB_STATUS_LABELS[job.status]}</Badge>
              </Link>
            );
          })}
        </div>
      )}

      <Pagination
        page={pagination.page}
        pageCount={pagination.pageCount}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={(p) => update({ page: String(p) })}
      />
    </div>
  );
}

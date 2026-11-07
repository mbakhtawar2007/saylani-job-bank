'use client';

import { APPLICANT_STATUSES, IDENTITY_STATUSES, type PaginationMeta } from '@jobbank/shared';
import { Contact, Funnel } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Input, Select, StatusPill } from '@/components/atoms';
import { EmptyState, SearchBar } from '@/components/molecules';
import { DataTable, type SortState } from '@/components/organisms';
import type { SelectOption } from '@/components/atoms';
import type { ApplicantListItem } from '@/domains/applicant';
import { formatDate } from '@/lib/format/date';
import { APPLICANT_STATUS_PILL, IDENTITY_PILL } from './labels';

export interface CityOption extends SelectOption {
  /** Master-data row id; areas link to their city through this. */
  id: string;
}

export interface AreaOption extends SelectOption {
  /** Master-data row id of the parent city. */
  parentId: string | null;
}

interface Props {
  rows: ApplicantListItem[];
  meta: PaginationMeta;
  sort: SortState;
  /** Shown only when the viewer can see more than one branch. */
  branches: SelectOption[];
  skills: SelectOption[];
  cities: CityOption[];
  areas: AreaOption[];
}

const FILTER_KEYS = [
  'status',
  'identityStatus',
  'skillCode',
  'branchId',
  'cityCode',
  'areaCode',
  'createdFrom',
  'createdTo',
] as const;

export function ApplicantsTable({ rows, meta, sort, branches, skills, cities, areas }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activeFilters = FILTER_KEYS.filter((key) => params.get(key)).length;
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

  const selectedCity = cities.find((c) => c.value === params.get('cityCode'));
  const areaOptions = selectedCity ? areas.filter((a) => a.parentId === selectedCity.id) : [];

  return (
    <DataTable<ApplicantListItem>
      caption="Applicants"
      rows={rows}
      getRowId={(r) => r.id}
      sort={sort}
      onSortChange={(s) => update({ sort: `${s.id}:${s.direction}` })}
      onRowClick={(r) => router.push(`${pathname}/${r.id}`)}
      toolbar={
        <>
          <SearchBar
            className="w-full sm:max-w-xs"
            defaultValue={params.get('q') ?? ''}
            onSearch={(q) => update({ q: q || null })}
            placeholder="Name, CNIC, mobile or area…"
            label="Search applicants"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="applicant-filters"
          >
            <Funnel className="mr-1.5 size-4" aria-hidden="true" />
            Filters
            {activeFilters > 0 && (
              <span className="bg-primary text-primary-fg ms-1.5 grid size-5 place-items-center rounded-full text-xs font-semibold">
                {activeFilters}
              </span>
            )}
          </Button>
          {filtersOpen && (
            <div
              id="applicant-filters"
              className="border-border bg-surface-muted/50 grid w-full gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <label className="grid gap-1 text-xs font-medium">
                Status
                <Select
                  aria-label="Filter by status"
                  value={params.get('status') ?? ''}
                  onChange={(e) => update({ status: e.target.value || null })}
                  placeholder="Any status"
                  options={APPLICANT_STATUSES.map((s) => ({
                    value: s,
                    label: APPLICANT_STATUS_PILL[s].label,
                  }))}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Identity check
                <Select
                  aria-label="Filter by identity check"
                  value={params.get('identityStatus') ?? ''}
                  onChange={(e) => update({ identityStatus: e.target.value || null })}
                  placeholder="Any identity status"
                  options={IDENTITY_STATUSES.map((s) => ({
                    value: s,
                    label: IDENTITY_PILL[s].label,
                  }))}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Skill
                <Select
                  aria-label="Filter by skill"
                  value={params.get('skillCode') ?? ''}
                  onChange={(e) => update({ skillCode: e.target.value || null })}
                  placeholder="Any skill"
                  options={skills}
                />
              </label>
              {branches.length > 1 && (
                <label className="grid gap-1 text-xs font-medium">
                  Branch
                  <Select
                    aria-label="Filter by branch"
                    value={params.get('branchId') ?? ''}
                    onChange={(e) => update({ branchId: e.target.value || null })}
                    placeholder="All branches"
                    options={branches}
                  />
                </label>
              )}
              <label className="grid gap-1 text-xs font-medium">
                City
                <Select
                  aria-label="Filter by city"
                  value={params.get('cityCode') ?? ''}
                  onChange={(e) => update({ cityCode: e.target.value || null, areaCode: null })}
                  placeholder="Any city"
                  options={cities}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Area
                <Select
                  aria-label="Filter by area"
                  value={params.get('areaCode') ?? ''}
                  onChange={(e) => update({ areaCode: e.target.value || null })}
                  placeholder={selectedCity ? 'Any area' : 'Choose a city first'}
                  options={areaOptions}
                  disabled={!selectedCity}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Registered from
                <Input
                  type="date"
                  aria-label="Registered from"
                  value={params.get('createdFrom') ?? ''}
                  onChange={(e) => update({ createdFrom: e.target.value || null })}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Registered to
                <Input
                  type="date"
                  aria-label="Registered to"
                  value={params.get('createdTo') ?? ''}
                  onChange={(e) => update({ createdTo: e.target.value || null })}
                />
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={clearFilters}
                  disabled={activeFilters === 0 && !params.get('q')}
                >
                  Clear all filters
                </Button>
              </div>
            </div>
          )}
        </>
      }
      empty={
        <EmptyState
          icon={Contact}
          title="No applicants found"
          description="Try clearing the filters or searching by CNIC or mobile number."
        />
      }
      pagination={{
        page: meta.page,
        pageCount: meta.pageCount,
        pageSize: meta.pageSize,
        total: meta.total,
        onPageChange: (p) => update({ page: String(p) }),
      }}
      columns={[
        {
          id: 'fullName',
          header: 'Name',
          sortable: true,
          cell: (r) => (
            <div className="grid min-w-0">
              <span className="truncate font-medium">{r.fullName}</span>
              <span className="text-fg-subtle numeric truncate text-xs">
                {r.cnicMasked}
                {r.phoneMasked ? ` · ${r.phoneMasked}` : ''}
              </span>
            </div>
          ),
        },
        {
          id: 'area',
          header: 'Area',
          hideBelow: 'md',
          cell: (r) =>
            r.areaLabel || r.cityLabel ? (
              [r.areaLabel, r.cityLabel].filter(Boolean).join(', ')
            ) : (
              <span className="text-fg-subtle">No location yet</span>
            ),
        },
        ...(branches.length > 1
          ? [
              {
                id: 'branch',
                header: 'Branch',
                hideBelow: 'lg' as const,
                cell: (r: ApplicantListItem) =>
                  r.branchName ?? <span className="text-fg-subtle">Not chosen</span>,
              },
            ]
          : []),
        {
          id: 'profileCompleteness',
          header: 'Profile',
          sortable: true,
          hideBelow: 'sm',
          cell: (r) => <span className="numeric">{r.profileCompleteness}%</span>,
        },
        {
          id: 'identity',
          header: 'Identity',
          hideBelow: 'md',
          cell: (r) => <StatusPill {...IDENTITY_PILL[r.identityStatus]} />,
        },
        {
          id: 'createdAt',
          header: 'Registered',
          sortable: true,
          hideBelow: 'lg',
          cell: (r) => formatDate(r.createdAt),
        },
        {
          id: 'status',
          header: 'Status',
          cell: (r) => <StatusPill {...APPLICANT_STATUS_PILL[r.status]} />,
        },
      ]}
    />
  );
}

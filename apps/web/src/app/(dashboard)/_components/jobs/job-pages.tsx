import type { Role } from '@jobbank/shared';
import { JOB_SORTABLE, jobFilters, listJobs } from '@/domains/job';
import { requireRole } from '@/domains/auth';
import { listMasterData } from '@/domains/settings';
import { ValidationError } from '@/domains/shared/errors';
import { parseListQuery } from '@/domains/shared/pagination';
import { Button } from '@/components/atoms';
import { PlusCircle } from 'lucide-react';
import NextLink from 'next/link';
import { loadForPage } from '../../_lib/page-context';
import { JobsTable } from './JobsTable';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const listOptions = {
  sortable: JOB_SORTABLE,
  defaultSort: { field: 'createdAt' as const, direction: 'desc' as const },
  filters: jobFilters,
};

/** Shared staff job list (Staff, Branch Admin, Super Admin); filters live in the URL. */
export async function JobListPage({
  role,
  basePath,
  subtitle,
  postJobHref,
  searchParams,
}: {
  role: Role;
  basePath: string;
  /** e.g. "in your branch" / "total" — shown after the result count. */
  subtitle: string;
  /** Branch Admin posts jobs; Staff and Super Admin do not get the button here. */
  postJobHref?: string;
  searchParams: SearchParams;
}) {
  const { actor } = await requireRole(role);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string' && value) params.set(key, value);
  }
  let query;
  try {
    query = parseListQuery(params, listOptions);
  } catch (error) {
    // A hand-edited URL with bad filters falls back to the default view.
    if (!(error instanceof ValidationError)) throw error;
    query = parseListQuery(new URLSearchParams(), listOptions);
  }
  const [{ items, pagination }, categories, cities] = await Promise.all([
    loadForPage(actor, () => listJobs(actor, query)),
    listMasterData(actor, { type: 'JOB_CATEGORY' }),
    listMasterData(actor, { type: 'CITY' }),
  ]);

  return (
    <div className="grid w-full gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-fg text-2xl font-semibold">Jobs</h1>
          <p className="text-fg-muted mt-1 text-sm">
            {pagination.total} {subtitle}
          </p>
        </div>
        {postJobHref && (
          <Button asChild size="sm">
            <NextLink href={postJobHref}>
              <PlusCircle className="mr-1.5 size-4" />
              Post a job
            </NextLink>
          </Button>
        )}
      </header>
      <JobsTable
        items={items}
        pagination={pagination}
        categories={categories.map((c) => ({ value: c.code, label: c.label }))}
        cities={cities.map((c) => ({ value: c.code, label: c.label }))}
        basePath={basePath}
      />
    </div>
  );
}

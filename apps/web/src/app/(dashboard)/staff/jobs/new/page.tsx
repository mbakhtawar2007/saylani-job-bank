import { requireRole } from '@/domains/auth';
import { listCompanies } from '@/domains/company';
import { listMasterData } from '@/domains/settings';
import { StaffPostJobForm } from '../../../branch-admin/jobs/new/_components/StaffPostJobForm';

export const metadata = { title: 'Post a job' };

/**
 * Staff job creation. Staff could not reach /branch-admin/jobs/new (it
 * requires BRANCH_ADMIN), so this is the staff-side route reusing the same
 * form — same VERIFIED-companies list, same ?companyId= preselect, landing
 * back on the staff Jobs list.
 */
export default async function StaffPostJobPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const [{ actor }, { companyId }] = await Promise.all([requireRole('STAFF'), searchParams]);
  const [{ items: companies }, categories] = await Promise.all([
    listCompanies(actor, {
      page: 1,
      pageSize: 200,
      limit: 200,
      offset: 0,
      sort: { field: 'legalName', direction: 'asc' },
      q: undefined,
      filters: { status: 'VERIFIED' },
    }),
    listMasterData(actor, { type: 'JOB_CATEGORY' }),
  ]);

  return (
    <div className="grid w-full gap-6">
      <header>
        <h1 className="text-fg text-2xl font-semibold">Post a job</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Create a job posting for a verified company in your branch.
        </p>
      </header>
      <StaffPostJobForm
        companies={companies.map((c) => ({ id: c.id, name: c.legalName }))}
        categories={categories.map((c) => ({ code: c.code, label: c.label }))}
        initialCompanyId={companyId}
        successHref="/staff/jobs"
      />
    </div>
  );
}

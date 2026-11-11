import { requireRole } from '@/domains/auth';
import { getJobDetail } from '@/domains/job';
import { masterDataLabels } from '@/domains/settings';
import { NotFoundError, ScopeViolationError } from '@/domains/shared/errors';
import { notFound, redirect } from 'next/navigation';
import { JobDetailView } from '@/app/(dashboard)/_components/jobs/JobDetailView';

export const metadata = { title: 'Job detail — Branch Admin' };

export default async function BranchAdminJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { actor } = await requireRole('BRANCH_ADMIN');
  const { id } = await params;

  try {
    const job = await getJobDetail(actor, id);
    // Audit 2026-11-11 (M-30): the rendering lives in JobDetailView, shared
    // with the company-job page — one implementation, labels resolved.
    const labels = await masterDataLabels([
      'EDUCATION_LEVEL',
      'JOB_CATEGORY',
      'LANGUAGE',
      'SKILL',
      'CITY',
    ]);
    return (
      <JobDetailView
        job={job}
        backHref="/branch-admin/jobs"
        backLabel="Back to jobs"
        labels={labels}
      />
    );
  } catch (e) {
    if (e instanceof NotFoundError) return notFound();
    // Audit 2026-11-11 (M-29): a cross-city job URL throws ScopeViolationError
    // from assertCityAccess — send the user to /forbidden instead of the
    // default Next.js error screen.
    if (e instanceof ScopeViolationError) redirect('/forbidden');
    throw e;
  }
}

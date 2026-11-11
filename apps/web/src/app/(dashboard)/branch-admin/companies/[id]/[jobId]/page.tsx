import { z } from 'zod';
import { notFound } from 'next/navigation';
import { requireRole } from '@/domains/auth';
import { getCompanyJobDetail } from '@/domains/job';
import { masterDataLabels } from '@/domains/settings';
import { loadForPage } from '@/app/(dashboard)/_lib/page-context';
import { JobDetailView } from '@/app/(dashboard)/_components/jobs/JobDetailView';

export const metadata = { title: 'Job detail' };

export default async function BranchAdminCompanyJobPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}) {
  const { actor } = await requireRole('BRANCH_ADMIN');
  const parsed = z.object({ id: z.uuid(), jobId: z.uuid() }).safeParse(await params);
  if (!parsed.success) return notFound();

  const { company, job } = await loadForPage(actor, () =>
    getCompanyJobDetail(actor, parsed.data.id, parsed.data.jobId),
  );
  // Audit 2026-11-11 (M-30): the stale BranchJobDetail is gone — this page
  // now renders the same rich JobDetailView as /branch-admin/jobs/[id],
  // with labels resolved (no raw codes) and Benefits & Perks + Timeline.
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
      backHref={`/branch-admin/companies/${company.id}`}
      backLabel={`Back to ${company.details.legalName}`}
      labels={labels}
    />
  );
}

import { z } from 'zod';
import { notFound } from 'next/navigation';
import { requireRole } from '@/domains/auth';
import { getCompanyJobDetail } from '@/domains/job';
import { listMasterData } from '@/domains/settings';
import { BranchJobDetail } from '../../../_components/BranchJobDetail';
import { loadForPage } from '@/app/(dashboard)/_lib/page-context';

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
  const categories = await listMasterData(actor, { type: 'JOB_CATEGORY' });
  return (
    <BranchJobDetail
      job={job}
      company={{ id: company.id, name: company.details.legalName }}
      categoryLabel={categories.find((category) => category.code === job.categoryCode)?.label}
    />
  );
}

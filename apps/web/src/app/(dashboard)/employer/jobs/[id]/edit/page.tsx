import { requireRole } from '@/domains/auth';
import { getMyJob } from '@/domains/job';
import { NotFoundError } from '@/domains/shared/errors';
import { notFound } from 'next/navigation';
import { JobWizard } from '../../_components/JobWizard';

export const metadata = { title: 'Edit job' };

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireRole('EMPLOYER');
  const { id } = await params;

  try {
    const job = await getMyJob(actor, id);
    // 2026-11-12: the company may fully edit its own job in any editable
    // status — the old published-job field restrictions were lifted.
    return <JobWizard initialJob={job} />;
  } catch (e) {
    if (e instanceof NotFoundError) return notFound();
    throw e;
  }
}

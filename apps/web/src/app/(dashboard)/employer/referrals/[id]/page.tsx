import { requireRole } from '@/domains/auth';
import { ReferralDetail } from '../_components/ReferralDetail';

export const metadata = { title: 'Referred Candidate — Saylani Job Bank' };

export default async function EmployerReferralDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { actor } = await requireRole('EMPLOYER');
  return <ReferralDetail actor={actor} id={id} />;
}

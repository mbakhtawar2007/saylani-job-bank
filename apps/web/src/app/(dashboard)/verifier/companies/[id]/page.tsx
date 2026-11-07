import { getCompanyDetail, getCompanyOnboarding } from '@/domains/company';
import { requireRole } from '@/domains/auth';
import { StaffCompanyPanel } from '@/app/(dashboard)/branch-admin/companies/[id]/_components/StaffCompanyPanel';

export const metadata = { title: 'Company detail' };

export default async function VerifierCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ actor }, { id }] = await Promise.all([requireRole('VERIFIER'), params]);
  const [company, onboarding] = await Promise.all([
    getCompanyDetail(actor, id),
    getCompanyOnboarding(actor, id),
  ]);
  return (
    <StaffCompanyPanel
      company={company}
      onboarding={onboarding}
      canSuspend={false}
      canManage={false}
      canOnboard
    />
  );
}

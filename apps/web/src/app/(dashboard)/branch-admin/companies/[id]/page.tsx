import { getCompanyDetail, getCompanyOnboarding } from '@/domains/company';
import { requireRole } from '@/domains/auth';
import { StaffCompanyPanel } from './_components/StaffCompanyPanel';

export const metadata = { title: 'Company detail' };

export default async function BranchAdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ actor }, { id }] = await Promise.all([requireRole('BRANCH_ADMIN'), params]);
  const [company, onboarding] = await Promise.all([
    getCompanyDetail(actor, id),
    getCompanyOnboarding(actor, id),
  ]);
  return (
    <StaffCompanyPanel
      company={company}
      onboarding={onboarding}
      canSuspend
      canManage={false}
      canOnboard
    />
  );
}

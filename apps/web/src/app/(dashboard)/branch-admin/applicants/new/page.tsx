import { requireRole } from '@/domains/auth';
import { listBranches } from '@/domains/branch';
import { profileLists } from '../../../_components/applicants/lists';
import { StaffRegisterApplicantForm } from '../../../_components/applicants/StaffRegisterApplicantForm';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Register job seeker' };

export default async function BranchAdminRegisterApplicantPage() {
  const { actor } = await requireRole('BRANCH_ADMIN');
  if (!actor.permissions.has('applicant:create')) redirect('/forbidden');
  const [branches, lists] = await Promise.all([listBranches(actor), profileLists(actor)]);
  const branch = branches.find((item) => item.isActive && actor.branchIds.includes(item.id));
  const branchOptions = branch ? [{ value: branch.id, label: branch.name }] : [];
  return (
    <div className="grid w-full gap-6">
      <header>
        <h1 className="text-fg text-2xl font-semibold">Register job seeker</h1>
        <p className="text-fg-muted mt-1 text-sm">Register a visitor in your assigned branch.</p>
      </header>
      <StaffRegisterApplicantForm
        branches={branchOptions}
        cities={lists.cities}
        areas={lists.areas}
        educationLevels={lists.educationLevels}
        skills={lists.skills}
        languages={lists.languages}
        categories={lists.categories}
        basePath="/branch-admin/applicants"
      />
    </div>
  );
}

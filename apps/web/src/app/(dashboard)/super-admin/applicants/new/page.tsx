import { requireRole } from '@/domains/auth';
import { listBranches } from '@/domains/branch';
import { profileLists } from '../../../_components/applicants/lists';
import { StaffRegisterApplicantForm } from '../../../_components/applicants/StaffRegisterApplicantForm';

export const metadata = { title: 'Register job seeker' };

export default async function SuperAdminRegisterApplicantPage() {
  const { actor } = await requireRole('SUPER_ADMIN');
  const [branches, lists] = await Promise.all([listBranches(actor), profileLists(actor)]);
  return (
    <div className="grid w-full gap-6">
      <header>
        <h1 className="text-fg text-2xl font-semibold">Register job seeker</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Create an account and applicant profile for a branch visitor.
        </p>
      </header>
      <StaffRegisterApplicantForm
        branches={branches
          .filter((branch) => branch.isActive)
          .map((branch) => ({ value: branch.id, label: branch.name }))}
        cities={lists.cities}
        areas={lists.areas}
        educationLevels={lists.educationLevels}
        skills={lists.skills}
        languages={lists.languages}
        categories={lists.categories}
        basePath="/super-admin/applicants"
      />
    </div>
  );
}

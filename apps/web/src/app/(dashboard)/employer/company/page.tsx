import { getMyCompany, listMyCompanies, MAX_COMPANIES_PER_EMPLOYER } from '@/domains/company';
import { requireRole } from '@/domains/auth';
import { CompanyStatusPanel } from './_components/CompanyStatusPanel';
import { CompanySwitcher } from './_components/CompanySwitcher';
import { CompanyWizard } from './_components/CompanyWizard';

export const metadata = { title: 'Company registration' };

export default async function EmployerCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; new?: string }>;
}) {
  const { actor } = await requireRole('EMPLOYER');
  const [companies, { step, new: isNew }] = await Promise.all([
    listMyCompanies(actor),
    searchParams,
  ]);
  // The active company is the switcher-picked one (actor.companyId), else the first.
  const company =
    companies.find((c) => c.id === actor.companyId) ?? companies[0] ?? (await getMyCompany(actor));
  const canRegisterAnother = companies.length < MAX_COMPANIES_PER_EMPLOYER;
  // "?new=1" starts a fresh wizard for the second company; with two already
  // registered it is ignored and the active company is shown instead.
  const registeringAnother = isNew === '1' && canRegisterAnother;

  const switcher = (
    <CompanySwitcher
      companies={companies}
      activeCompanyId={company?.id ?? null}
      canRegisterAnother={canRegisterAnother}
    />
  );

  if (registeringAnother || !company) {
    return (
      <div className="grid gap-4">
        {switcher}
        <CompanyWizard initialStep="details" initialCompany={null} />
      </div>
    );
  }

  // Only an un-verified company is editable by the employer: DRAFT, or fixing what
  // a verifier asked for (INFO_REQUESTED) / was rejected (REJECTED). Every other
  // status — VERIFIED, SUSPENDED, and anything waiting with a verifier — is
  // read-only here; a ?step= deep link must not reopen the wizard.
  const editableStatus =
    company.status === 'DRAFT' ||
    company.status === 'INFO_REQUESTED' ||
    company.status === 'REJECTED';
  if (!editableStatus) {
    return (
      <div className="grid gap-4">
        {switcher}
        <CompanyStatusPanel company={company} />
      </div>
    );
  }

  const wizardStep = (step as string | undefined) ?? 'details';
  return (
    <div className="grid gap-4">
      {switcher}
      <CompanyWizard initialStep={wizardStep} initialCompany={company} />
    </div>
  );
}

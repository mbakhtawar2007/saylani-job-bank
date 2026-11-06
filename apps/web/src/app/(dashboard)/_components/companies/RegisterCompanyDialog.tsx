'use client';

import {
  COMPANY_SIZE_BANDS,
  COMPANY_SIZE_LABELS,
  LEGAL_STRUCTURES,
  LEGAL_STRUCTURE_LABELS,
  staffOnboardCompanySchema,
} from '@jobbank/shared';
import { Building2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Input, Select, Textarea } from '@/components/atoms';
import type { SelectOption } from '@/components/atoms';
import { FormField, Modal } from '@/components/molecules';
import type { CompanyOnboarding, CompanyView } from '@/domains/company';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import { errorMessage, toFieldErrors, zodFieldErrors, type FieldErrors } from '../applicants/form';
import {
  FormErrorSummary,
  fieldControlId,
  humanizeFieldKey,
  useFocusFieldErrors,
} from '../FormErrorSummary';
import { CompanyRegistrationFormPrint } from './CompanyRegistrationFormPrint';

interface MasterDataOption {
  id: string;
  code: string;
  label: string;
  parentId: string | null;
}

type OnboardedCompany = CompanyView & { onboarding: CompanyOnboarding };

const todayIso = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};

interface Props {
  branches: SelectOption[];
  placement?: 'default' | 'sidebar';
}

const STRUCTURE_OPTIONS = LEGAL_STRUCTURES.map((v) => ({
  value: v,
  label: LEGAL_STRUCTURE_LABELS[v],
}));
const SIZE_OPTIONS = COMPANY_SIZE_BANDS.map((v) => ({ value: v, label: COMPANY_SIZE_LABELS[v] }));

/** Visible labels for error keys, used by the error summary. */
const COMPANY_FIELD_LABELS: Record<string, string> = {
  branchId: 'Branch',
  legalName: 'Legal name',
  tradeName: 'Trading name',
  legalStructure: 'Legal structure',
  ntn: 'NTN',
  registrationNo: 'Registration No.',
  industryCode: 'Industry',
  sizeBand: 'Company size',
  website: 'Website',
  description: 'Description',
  contactName: 'Contact person',
  contactDesignation: 'Designation',
  contactPhone: 'Phone',
  contactEmail: 'Email',
  visitDate: 'Visit date',
  agreed: 'Company agreed to work with us',
  headOfficeAddress: 'Head-office address',
  otherSites: 'Other sites',
  workforceRoles: 'Roles to hire for',
  workforceType: 'Type of work',
  workforceShifts: 'Shifts / timings',
  workforceOpenings: 'Number of openings',
  yearsInBusiness: 'Years in business',
  certifications: 'Certifications',
  previousHiring: 'Previous hiring experience',
  additionalNotes: 'Additional details / assessment notes',
};

function companyFieldLabel(key: string): string {
  return COMPANY_FIELD_LABELS[key] ?? humanizeFieldKey(key);
}

export function RegisterCompanyDialog({ branches, placement = 'default' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const { requestErrorFocus, requestAlertFocus } = useFocusFieldErrors(errors, formRef, alert);
  const [company, setCompany] = useState<OnboardedCompany | null>(null);
  const [printReady, setPrintReady] = useState(false);
  // True once the print form's QR code and logo have settled. The Print
  // button stays disabled until then — and until the industry label fetch
  // has settled too, or the form prints the raw industry code.
  const [printLabelsReady, setPrintLabelsReady] = useState(false);
  const [industriesSettled, setIndustriesSettled] = useState(false);
  const [verifiedSigned, setVerifiedSigned] = useState(false);
  const [markingSigned, setMarkingSigned] = useState(false);
  const [industries, setIndustries] = useState<MasterDataOption[]>([]);
  const [form, setForm] = useState({
    branchId: branches.length === 1 ? branches[0]!.value : '',
    legalName: '',
    tradeName: '',
    legalStructure: '',
    ntn: '',
    registrationNo: '',
    industryCode: '',
    sizeBand: '',
    website: '',
    description: '',
    contactName: '',
    contactDesignation: '',
    contactPhone: '',
    contactEmail: '',
    visitDate: todayIso(),
    agreed: false,
    headOfficeAddress: '',
    otherSites: '',
    workforceRoles: '',
    workforceType: '',
    workforceShifts: '',
    workforceOpenings: '',
    yearsInBusiness: '',
    previousHiring: '',
    certifications: '',
    additionalNotes: '',
  });

  const updateForm = (changes: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...changes }));

  useEffect(() => {
    setPrintReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (industries.length > 0) {
      // Already loaded on a previous open: the label is available.
      setIndustriesSettled(true);
      return;
    }
    let active = true;
    setLoadingOptions(true);
    setAlert(null);
    apiFetch<MasterDataOption[]>('/api/v1/master-data?type=INDUSTRY')
      .then(({ data }) => {
        if (active) setIndustries(data ?? []);
      })
      .catch((error: unknown) => {
        if (active) setAlert(errorMessage(error));
      })
      .finally(() => {
        if (active) {
          setLoadingOptions(false);
          setIndustriesSettled(true);
        }
      });
    return () => {
      active = false;
    };
  }, [open, industries.length]);

  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      setCompany(null);
      setPrintLabelsReady(false);
      setVerifiedSigned(false);
      setErrors({});
      setAlert(null);
      setForm({
        branchId: branches.length === 1 ? branches[0]!.value : '',
        legalName: '',
        tradeName: '',
        legalStructure: '',
        ntn: '',
        registrationNo: '',
        industryCode: '',
        sizeBand: '',
        website: '',
        description: '',
        contactName: '',
        contactDesignation: '',
        contactPhone: '',
        contactEmail: '',
        visitDate: todayIso(),
        agreed: false,
        headOfficeAddress: '',
        otherSites: '',
        workforceRoles: '',
        workforceType: '',
        workforceShifts: '',
        workforceOpenings: '',
        yearsInBusiness: '',
        previousHiring: '',
        certifications: '',
        additionalNotes: '',
      });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);
    const parsed = staffOnboardCompanySchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      requestErrorFocus();
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { data } = await apiFetch<OnboardedCompany>('/api/v1/companies/onboard', {
        method: 'POST',
        body: parsed.data,
      });
      setCompany(data);
      // A new company mounts a fresh print form (keyed by id): its QR and
      // logo have not loaded yet.
      setPrintLabelsReady(false);
      setVerifiedSigned(Boolean(data.registrationVerifiedSignedAt));
      setOpen(false);
      router.replace(pathname);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.issues.length > 0) {
        setErrors(toFieldErrors(error.issues));
        requestErrorFocus();
      } else {
        // A non-field server error supersedes any stale field errors.
        setErrors({});
        setAlert(errorMessage(error));
        requestAlertFocus();
      }
    } finally {
      setLoading(false);
    }
  };

  const markAsVerifiedSigned = async () => {
    if (!company) return;
    setMarkingSigned(true);
    setAlert(null);
    try {
      const { data } = await apiFetch<{
        verifiedSigned: boolean;
        status: string;
        company: CompanyView;
      }>(`/api/v1/companies/${company.id}/registration-form/verified-signed`, {
        method: 'POST',
      });
      setCompany((current) =>
        current ? { ...current, ...data.company, onboarding: current.onboarding } : current,
      );
      setVerifiedSigned(true);
      router.refresh();
    } catch (error) {
      setAlert(errorMessage(error));
    } finally {
      setMarkingSigned(false);
    }
  };

  const industryOptions = industries.map((i) => ({ value: i.code, label: i.label }));
  const branchOptions = branches;
  const industryLabel =
    industries.find((i) => i.code === company?.details.industryCode)?.label ?? null;
  const printForm =
    company && printReady
      ? createPortal(
          <CompanyRegistrationFormPrint
            key={company.id}
            company={company}
            onboarding={company.onboarding}
            industryLabel={industryLabel}
            onReady={() => setPrintLabelsReady(true)}
          />,
          document.body,
        )
      : null;

  return (
    <>
      <Modal
        title="Register company"
        description="Register a company you visited and onboarded, then review and print the form for verification and signature."
        open={open}
        onOpenChange={setDialogOpen}
        size="lg"
        trigger={
          <Button fullWidth={placement === 'sidebar'} leftIcon={<Building2 aria-hidden="true" />}>
            Register Company
          </Button>
        }
      >
        <form className="grid gap-5" onSubmit={submit} noValidate ref={formRef}>
          {alert && (
            <p
              role="alert"
              className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm"
            >
              {alert}
            </p>
          )}
          {loadingOptions && <p className="text-fg-muted text-sm">Loading options…</p>}
          {branches.length > 1 && (
            <FormField
              label="Branch"
              required
              error={errors.branchId}
              id={fieldControlId('branchId')}
            >
              <Select
                value={form.branchId}
                onChange={(event) => updateForm({ branchId: event.target.value })}
                placeholder="Choose a branch"
                options={branchOptions}
              />
            </FormField>
          )}

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">1. Company details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Legal name"
                required
                error={errors.legalName}
                id={fieldControlId('legalName')}
              >
                <Input
                  value={form.legalName}
                  onChange={(e) => updateForm({ legalName: e.target.value })}
                  placeholder="Registered company name"
                />
              </FormField>
              <FormField
                label="Trading name"
                error={errors.tradeName}
                id={fieldControlId('tradeName')}
              >
                <Input
                  value={form.tradeName}
                  onChange={(e) => updateForm({ tradeName: e.target.value })}
                  placeholder="If different from legal name"
                />
              </FormField>
              <FormField
                label="Legal structure"
                required
                error={errors.legalStructure}
                id={fieldControlId('legalStructure')}
              >
                <Select
                  value={form.legalStructure}
                  onChange={(e) => updateForm({ legalStructure: e.target.value })}
                  placeholder="Choose type"
                  options={STRUCTURE_OPTIONS}
                />
              </FormField>
              <FormField label="NTN" required error={errors.ntn} id={fieldControlId('ntn')}>
                <Input
                  value={form.ntn}
                  onChange={(e) => updateForm({ ntn: e.target.value })}
                  placeholder="e.g. 1234567-8"
                />
              </FormField>
              <FormField
                label="Registration No."
                error={errors.registrationNo}
                id={fieldControlId('registrationNo')}
              >
                <Input
                  value={form.registrationNo}
                  onChange={(e) => updateForm({ registrationNo: e.target.value })}
                  placeholder="Optional"
                />
              </FormField>
              <FormField
                label="Industry"
                required
                error={errors.industryCode}
                id={fieldControlId('industryCode')}
              >
                <Select
                  value={form.industryCode}
                  onChange={(e) => updateForm({ industryCode: e.target.value })}
                  placeholder="Select industry"
                  options={industryOptions}
                />
              </FormField>
              <FormField
                label="Company size"
                required
                error={errors.sizeBand}
                id={fieldControlId('sizeBand')}
              >
                <Select
                  value={form.sizeBand}
                  onChange={(e) => updateForm({ sizeBand: e.target.value })}
                  placeholder="Select size"
                  options={SIZE_OPTIONS}
                />
              </FormField>
              <FormField label="Website" error={errors.website} id={fieldControlId('website')}>
                <Input
                  value={form.website}
                  onChange={(e) => updateForm({ website: e.target.value })}
                  placeholder="https://example.com"
                />
              </FormField>
              <FormField
                label="Description"
                error={errors.description}
                id={fieldControlId('description')}
                className="sm:col-span-2"
              >
                <Textarea
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder="Brief description of the company (optional)"
                  rows={3}
                />
              </FormField>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">2. Contact person</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Contact person"
                required
                error={errors.contactName}
                id={fieldControlId('contactName')}
              >
                <Input
                  autoComplete="name"
                  value={form.contactName}
                  onChange={(e) => updateForm({ contactName: e.target.value })}
                  placeholder="Full name of the person you met"
                />
              </FormField>
              <FormField
                label="Designation"
                error={errors.contactDesignation}
                id={fieldControlId('contactDesignation')}
              >
                <Input
                  value={form.contactDesignation}
                  onChange={(e) => updateForm({ contactDesignation: e.target.value })}
                  placeholder="e.g. HR Manager"
                />
              </FormField>
              <FormField
                label="Phone"
                required
                error={errors.contactPhone}
                id={fieldControlId('contactPhone')}
              >
                <Input
                  type="tel"
                  autoComplete="tel"
                  value={form.contactPhone}
                  onChange={(e) => updateForm({ contactPhone: e.target.value })}
                  placeholder="0300 1234567 or 021 34567890"
                />
              </FormField>
              <FormField
                label="Email"
                error={errors.contactEmail}
                id={fieldControlId('contactEmail')}
              >
                <Input
                  type="email"
                  autoComplete="email"
                  value={form.contactEmail}
                  onChange={(e) => updateForm({ contactEmail: e.target.value })}
                  placeholder="Optional"
                />
              </FormField>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">3. Outreach record</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Visit date"
                required
                error={errors.visitDate}
                id={fieldControlId('visitDate')}
              >
                <Input
                  type="date"
                  max={todayIso()}
                  value={form.visitDate}
                  onChange={(e) => updateForm({ visitDate: e.target.value })}
                />
              </FormField>
              <div className="flex items-end pb-1" id={fieldControlId('agreed')}>
                <Checkbox
                  label="Company agreed to work with us"
                  checked={form.agreed}
                  onCheckedChange={(checked) => updateForm({ agreed: checked === true })}
                />
              </div>
            </div>
            {errors.agreed && (
              <p role="alert" className="text-danger text-sm">
                {errors.agreed}
              </p>
            )}
            <p className="text-fg-muted text-sm">
              Your name is recorded automatically as the staff member who onboarded this company.
            </p>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">4. Address &amp; locations</h2>
            <FormField
              label="Head-office address"
              error={errors.headOfficeAddress}
              id={fieldControlId('headOfficeAddress')}
            >
              <Input
                autoComplete="street-address"
                value={form.headOfficeAddress}
                onChange={(e) => updateForm({ headOfficeAddress: e.target.value })}
                placeholder="Plot / building, street, area, city"
              />
            </FormField>
            <FormField
              label="Other sites"
              error={errors.otherSites}
              id={fieldControlId('otherSites')}
            >
              <Textarea
                value={form.otherSites}
                onChange={(e) => updateForm({ otherSites: e.target.value })}
                placeholder="Other factories, shops or offices, if any"
                rows={2}
              />
            </FormField>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">5. Workforce needs</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Roles to hire for"
                error={errors.workforceRoles}
                id={fieldControlId('workforceRoles')}
              >
                <Input
                  value={form.workforceRoles}
                  onChange={(e) => updateForm({ workforceRoles: e.target.value })}
                  placeholder="e.g. Machine operators, helpers"
                />
              </FormField>
              <FormField
                label="Type of work"
                error={errors.workforceType}
                id={fieldControlId('workforceType')}
              >
                <Input
                  value={form.workforceType}
                  onChange={(e) => updateForm({ workforceType: e.target.value })}
                  placeholder="e.g. Full-time, shift-based"
                />
              </FormField>
              <FormField
                label="Shifts / timings"
                error={errors.workforceShifts}
                id={fieldControlId('workforceShifts')}
              >
                <Input
                  value={form.workforceShifts}
                  onChange={(e) => updateForm({ workforceShifts: e.target.value })}
                  placeholder="e.g. Day shift, 9am–6pm"
                />
              </FormField>
              <FormField
                label="Number of openings"
                error={errors.workforceOpenings}
                id={fieldControlId('workforceOpenings')}
              >
                <Input
                  value={form.workforceOpenings}
                  onChange={(e) => updateForm({ workforceOpenings: e.target.value })}
                  placeholder="If known"
                />
              </FormField>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">6. Business background</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Years in business"
                error={errors.yearsInBusiness}
                id={fieldControlId('yearsInBusiness')}
              >
                <Input
                  value={form.yearsInBusiness}
                  onChange={(e) => updateForm({ yearsInBusiness: e.target.value })}
                  placeholder="e.g. 5 years"
                />
              </FormField>
              <FormField
                label="Certifications"
                error={errors.certifications}
                id={fieldControlId('certifications')}
              >
                <Input
                  value={form.certifications}
                  onChange={(e) => updateForm({ certifications: e.target.value })}
                  placeholder="If any"
                />
              </FormField>
              <FormField
                label="Previous hiring experience"
                error={errors.previousHiring}
                id={fieldControlId('previousHiring')}
                className="sm:col-span-2"
              >
                <Textarea
                  value={form.previousHiring}
                  onChange={(e) => updateForm({ previousHiring: e.target.value })}
                  placeholder="How the company hired before, if known"
                  rows={2}
                />
              </FormField>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">7. Additional information</h2>
            <FormField
              label="Additional details / assessment notes"
              error={errors.additionalNotes}
              id={fieldControlId('additionalNotes')}
            >
              <Textarea
                value={form.additionalNotes}
                onChange={(e) => updateForm({ additionalNotes: e.target.value })}
                placeholder="Anything else needed to assess the company"
                rows={3}
              />
            </FormField>
          </section>

          {branches.length === 0 && (
            <p role="alert" className="text-danger text-sm">
              No branch is available for this account.
            </p>
          )}
          <FormErrorSummary errors={errors} labelFor={companyFieldLabel} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={branches.length === 0 || loadingOptions}
            >
              Save draft and review
            </Button>
          </div>
        </form>
      </Modal>

      {company && (
        <section className="registration-review-screen bg-surface fixed inset-0 z-[100] overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto grid max-w-4xl gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                <h1 className="text-fg text-2xl font-bold">Review &amp; Print</h1>
                <p className="text-fg-muted mt-1 text-sm">
                  Review the saved draft with the company representative. Print the complete form,
                  have it signed, then mark it verified and signed.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => window.print()}
                  disabled={!printLabelsReady || !industriesSettled}
                >
                  {printLabelsReady && industriesSettled ? 'Print form' : 'Preparing print…'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCompany(null);
                    setPrintLabelsReady(false);
                    router.refresh();
                  }}
                >
                  Done
                </Button>
              </div>
            </header>
            {alert && (
              <p
                role="alert"
                className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm"
              >
                {alert}
              </p>
            )}
            <div className="rounded-xl border p-4">
              <h2 className="font-semibold">{company.details.legalName}</h2>
              <p className="text-fg-muted text-sm">
                {company.status.charAt(0) + company.status.slice(1).toLowerCase()} · Company
                reference {company.id}
              </p>
            </div>
            <div className="rounded-xl border p-4">
              <h2 className="font-semibold">Registration form preview</h2>
              <p className="text-fg-muted mt-1 text-sm">
                The print version contains all sections, the outreach record, a QR code for the
                company reference, and the representative and staff signature fields.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void markAsVerifiedSigned()}
                loading={markingSigned}
                disabled={verifiedSigned}
              >
                {verifiedSigned ? 'Verified & signed' : 'Mark as verified & signed'}
              </Button>
              {verifiedSigned && (
                <p role="status" className="text-success text-sm">
                  Verification and signature recorded. The company is now in the verifier queue
                  (Submitted).
                </p>
              )}
            </div>
          </div>
        </section>
      )}
      {printForm}
    </>
  );
}

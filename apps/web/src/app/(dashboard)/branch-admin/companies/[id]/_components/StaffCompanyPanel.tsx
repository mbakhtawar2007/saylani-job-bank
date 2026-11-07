'use client';

import { COMPANY_SIZE_LABELS, LEGAL_STRUCTURE_LABELS, type CompanyStatus } from '@jobbank/shared';
import { ArrowLeft, ExternalLink, Pause, Play, Printer } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Badge, Button, StatusPill, Textarea } from '@/components/atoms';
import { FormField, KeyValue } from '@/components/molecules';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import { formatDate } from '@/lib/format/date';
import { putWithProgress } from '@/lib/upload/put-with-progress';
import type { CompanyOnboarding, CompanyView } from '@/domains/company';
import { CompanyRegistrationFormPrint } from '@/app/(dashboard)/_components/companies/CompanyRegistrationFormPrint';

interface MasterDataOption {
  id: string;
  code: string;
  label: string;
  parentId: string | null;
}

const STATUS_PILL: Record<
  CompanyStatus,
  { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' | 'info' }
> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  SUBMITTED: { label: 'Submitted', variant: 'info' },
  UNDER_VERIFICATION: { label: 'Under review', variant: 'info' },
  INFO_REQUESTED: { label: 'Info needed', variant: 'warning' },
  RESUBMITTED: { label: 'Resubmitted', variant: 'info' },
  VERIFIED: { label: 'Verified', variant: 'success' },
  REJECTED: { label: 'Not approved', variant: 'danger' },
  SUSPENDED: { label: 'Suspended', variant: 'danger' },
};

export function StaffCompanyPanel({
  company,
  onboarding,
  canSuspend,
  canManage: _canManage,
  canOnboard = false,
}: {
  company: CompanyView;
  onboarding?: CompanyOnboarding | null;
  canSuspend: boolean;
  canManage: boolean;
  canOnboard?: boolean;
}) {
  const pathname = usePathname();
  const backHref = pathname.includes('super-admin')
    ? '/super-admin/companies'
    : pathname.includes('/verifier/')
      ? '/verifier/companies'
      : pathname.includes('/staff/')
        ? '/staff/companies'
        : '/branch-admin/companies';
  const [company_, setCompany_] = useState(company);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suspendNote, setSuspendNote] = useState('');
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [printReady, setPrintReady] = useState(false);
  // True once the print form's QR code and logo have settled. The Print
  // button stays disabled until then — and until the industry label fetch
  // has settled too, or the form prints the raw industry code.
  const [printLabelsReady, setPrintLabelsReady] = useState(false);
  const [industriesSettled, setIndustriesSettled] = useState(false);
  const [verifiedSigned, setVerifiedSigned] = useState(
    Boolean(company.registrationVerifiedSignedAt),
  );
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  // Staff upload (F1): only for a staff-onboarded DRAFT that has not been marked
  // verified & signed yet — the same condition as the verified-signed button.
  const canUploadDocs = Boolean(
    canOnboard && onboarding && company_.status === 'DRAFT' && !verifiedSigned,
  );
  const [industries, setIndustries] = useState<MasterDataOption[]>([]);

  useEffect(() => {
    setPrintReady(true);
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch<MasterDataOption[]>('/api/v1/master-data?type=INDUSTRY')
      .then(({ data }) => {
        if (active) setIndustries(data ?? []);
      })
      .catch(() => {
        // Industry label falls back to the raw industry code on the print form.
      })
      .finally(() => {
        if (active) setIndustriesSettled(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const industryLabel =
    industries.find((i) => i.code === company_.details.industryCode)?.label ?? null;

  const pill = STATUS_PILL[company_.status];

  async function changeStatus(status: 'SUSPENDED' | 'VERIFIED', note?: string) {
    setPending(status);
    setError(null);
    try {
      const { data: saved } = await apiFetch<CompanyView>(
        `/api/v1/companies/${company_.id}/status`,
        {
          method: 'PATCH',
          body: { status, note: note ?? null },
        },
      );
      setCompany_(saved);
      setShowSuspendForm(false);
      setSuspendNote('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setPending(null);
    }
  }

  async function getDocUrl(docId: string) {
    try {
      const { data } = await apiFetch<{ url: string; expiresIn: number }>(
        `/api/v1/companies/${company_.id}/documents/${docId}/url`,
      );
      window.open(data.url, '_blank');
    } catch {
      setError('Could not get document link.');
    }
  }

  /**
   * Staff document upload: presign → PUT straight to storage (with the signed
   * headers) → confirm. Size and type are enforced server-side by the presign
   * step; a rejected file surfaces the server's message in the panel error banner.
   * Uploading a file of a type that already has one replaces it on confirm.
   */
  async function uploadDocument(typeCode: string, file: File) {
    setUploadingDoc(typeCode);
    setError(null);
    try {
      const { data: presign } = await apiFetch<{
        documentId: string;
        upload: { url: string; headers: Record<string, string> };
      }>(`/api/v1/companies/${company_.id}/documents`, {
        method: 'POST',
        body: { typeCode, fileName: file.name, contentType: file.type, sizeBytes: file.size },
      });
      await putWithProgress({ url: presign.upload.url, file, headers: presign.upload.headers });
      const { data: saved } = await apiFetch<CompanyView>(
        `/api/v1/companies/${company_.id}/documents/${presign.documentId}/confirm`,
        { method: 'POST' },
      );
      setCompany_(saved);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploadingDoc(null);
    }
  }

  async function markAsVerifiedSigned() {
    setPending('verified-signed');
    setError(null);
    try {
      const { data } = await apiFetch<{
        verifiedSigned: boolean;
        status: string;
        company: CompanyView;
      }>(`/api/v1/companies/${company_.id}/registration-form/verified-signed`, { method: 'POST' });
      setCompany_(data.company);
      setVerifiedSigned(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid w-full gap-6">
      <div>
        <NextLink
          href={backHref}
          className="text-fg-muted mb-3 flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to companies
        </NextLink>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-fg text-2xl font-semibold">{company_.details.legalName}</h1>
            {company_.details.tradeName && (
              <p className="text-fg-muted text-sm">Trading as {company_.details.tradeName}</p>
            )}
            <div className="mt-1">
              <StatusPill label={pill.label} tone={pill.variant} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onboarding && (
              <Button
                variant="secondary"
                leftIcon={<Printer />}
                onClick={() => window.print()}
                disabled={!printLabelsReady || !industriesSettled}
              >
                {printLabelsReady && industriesSettled
                  ? 'Print registration form'
                  : 'Preparing print…'}
              </Button>
            )}
            {canOnboard && onboarding && company_.status === 'DRAFT' && !verifiedSigned && (
              <Button
                loading={pending === 'verified-signed'}
                onClick={() => void markAsVerifiedSigned()}
              >
                Mark as verified &amp; signed
              </Button>
            )}
            {canSuspend && company_.status === 'VERIFIED' && !showSuspendForm && (
              <Button
                variant="danger"
                leftIcon={<Pause />}
                onClick={() => setShowSuspendForm(true)}
              >
                Suspend
              </Button>
            )}
            {canSuspend && company_.status === 'SUSPENDED' && (
              <Button
                variant="primary"
                leftIcon={<Play />}
                loading={pending === 'VERIFIED'}
                onClick={() => void changeStatus('VERIFIED')}
              >
                Reinstate
              </Button>
            )}
          </div>
        </header>
      </div>

      {error && (
        <div className="bg-danger-soft text-danger-soft-fg rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {verifiedSigned && (
        <div className="bg-success-soft text-success-soft-fg rounded-xl px-4 py-3 text-sm">
          Verification and signature recorded. The company is now in the verifier queue (Submitted).
        </div>
      )}

      {showSuspendForm && (
        <div className="border-border bg-surface grid gap-3 rounded-xl border p-5">
          <h2 className="text-fg font-semibold">Suspend company</h2>
          <FormField label="Reason for suspension (optional — shown to the employer)">
            <Textarea
              rows={2}
              value={suspendNote}
              onChange={(e) => setSuspendNote(e.target.value)}
            />
          </FormField>
          <div className="flex gap-2">
            <Button
              variant="danger"
              loading={pending === 'SUSPENDED'}
              leftIcon={<Pause />}
              onClick={() => void changeStatus('SUSPENDED', suspendNote || undefined)}
            >
              Confirm suspension
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowSuspendForm(false);
                setSuspendNote('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <section className="border-border bg-surface grid gap-4 rounded-xl border p-5">
        <h2 className="text-fg font-semibold">Company details</h2>
        <KeyValue
          columns={2}
          items={[
            { label: 'NTN', value: company_.details.ntn },
            { label: 'Reg. no.', value: company_.details.registrationNo ?? '—' },
            { label: 'Structure', value: LEGAL_STRUCTURE_LABELS[company_.details.legalStructure] },
            { label: 'Size', value: COMPANY_SIZE_LABELS[company_.details.sizeBand] },
            { label: 'Branch', value: company_.branch?.name ?? '—' },
          ]}
        />
        {company_.details.website && (
          <a
            href={company_.details.website}
            target="_blank"
            rel="noreferrer"
            className="text-accent flex w-fit items-center gap-1 text-sm hover:underline"
          >
            <ExternalLink className="size-3.5" />
            {company_.details.website}
          </a>
        )}
        {company_.details.description && (
          <p className="text-fg-muted text-sm">{company_.details.description}</p>
        )}
      </section>

      {onboarding && (
        <section className="border-border bg-surface grid gap-4 rounded-xl border p-5">
          <h2 className="text-fg font-semibold">Onboarding</h2>
          <KeyValue
            columns={2}
            items={[
              {
                label: 'Onboarded by',
                value: onboarding.onboardedBy
                  ? `${onboarding.onboardedBy.name ?? ''}${onboarding.onboardedBy.roleLabel ? ` (${onboarding.onboardedBy.roleLabel})` : ''}`
                  : '—',
              },
              {
                label: 'Visit date',
                value: onboarding.visitDate ? formatDate(onboarding.visitDate) : '—',
              },
              {
                label: 'Registration form',
                value: company_.registrationVerifiedSignedAt
                  ? `Verified & signed ${formatDate(company_.registrationVerifiedSignedAt)}`
                  : 'Not yet verified & signed',
              },
              {
                label: 'Company agreed to work with us',
                value: onboarding.agreed ? 'Yes' : 'No',
              },
              { label: 'Head-office address', value: onboarding.notes.headOfficeAddress ?? '—' },
              { label: 'Other sites', value: onboarding.notes.otherSites ?? '—' },
              {
                label: 'Roles to hire for',
                value: onboarding.notes.workforceRoles ?? '—',
              },
              { label: 'Type of work', value: onboarding.notes.workforceType ?? '—' },
              { label: 'Shifts / timings', value: onboarding.notes.workforceShifts ?? '—' },
              { label: 'Number of openings', value: onboarding.notes.workforceOpenings ?? '—' },
              { label: 'Years in business', value: onboarding.notes.yearsInBusiness ?? '—' },
              { label: 'Previous hiring', value: onboarding.notes.previousHiring ?? '—' },
              { label: 'Certifications', value: onboarding.notes.certifications ?? '—' },
              { label: 'Additional notes', value: onboarding.notes.additionalNotes ?? '—' },
            ]}
          />
        </section>
      )}

      <section className="border-border bg-surface grid gap-4 rounded-xl border p-5">
        <h2 className="text-fg font-semibold">Primary contact</h2>
        {company_.contacts.length === 0 ? (
          <p className="text-fg-muted text-sm">No contacts on file.</p>
        ) : (
          <div className="grid gap-2">
            {company_.contacts.map((c, i) => (
              <div key={i} className="flex items-start justify-between text-sm">
                <div>
                  <p className="text-fg font-medium">{c.name}</p>
                  {c.designation && <p className="text-fg-muted">{c.designation}</p>}
                  <p className="text-fg-muted">{c.phone}</p>
                  {c.email && <p className="text-fg-muted">{c.email}</p>}
                </div>
                {c.isPrimary && <Badge tone="info">Main</Badge>}
              </div>
            ))}
          </div>
        )}
      </section>

      {(company_.documents.length > 0 || canUploadDocs) && (
        <section className="border-border bg-surface grid gap-4 rounded-xl border p-5">
          <h2 className="text-fg font-semibold">Documents</h2>
          {canUploadDocs && (
            <p className="text-fg-muted text-sm">
              Upload the required documents before marking the form verified &amp; signed. PDF, JPG
              or PNG — the file size and type are checked on upload. Uploading a file of a type that
              already has one replaces it.
            </p>
          )}
          {canUploadDocs ? (
            <div className="grid gap-3">
              {company_.requiredDocuments.map((code) => {
                const current = company_.documents.find((d) => d.typeCode === code);
                return (
                  <div key={code} className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid gap-0.5">
                      <p className="text-fg text-sm font-medium">{code.replace(/_/g, ' ')}</p>
                      {current ? (
                        <p className="text-fg-muted text-xs">{current.fileName}</p>
                      ) : (
                        <p className="text-fg-muted text-xs">Not uploaded yet</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {current?.reviewStatus === 'ACCEPTED' && (
                        <Badge tone="success">Accepted</Badge>
                      )}
                      {current?.reviewStatus === 'REJECTED' && (
                        <Badge tone="danger">Rejected</Badge>
                      )}
                      {current?.reviewStatus === 'PENDING' && <Badge tone="neutral">Pending</Badge>}
                      {current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void getDocUrl(current.id)}
                          rightIcon={<ExternalLink className="size-3.5" />}
                        >
                          View
                        </Button>
                      )}
                      {uploadingDoc === code ? (
                        <span className="text-fg-muted text-sm">Uploading…</span>
                      ) : (
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png"
                          disabled={uploadingDoc !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) void uploadDocument(code, file);
                          }}
                          className="text-fg-muted text-sm"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              {company_.requiredDocuments.length === 0 && (
                <p className="text-fg-muted text-sm">
                  No documents required for this business type yet.
                </p>
              )}
              {company_.documents
                .filter((d) => !company_.requiredDocuments.includes(d.typeCode))
                .map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3">
                    <div className="grid gap-0.5">
                      <p className="text-fg text-sm font-medium">
                        {doc.typeCode.replace(/_/g, ' ')}
                      </p>
                      <p className="text-fg-muted text-xs">{doc.fileName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.reviewStatus === 'ACCEPTED' && <Badge tone="success">Accepted</Badge>}
                      {doc.reviewStatus === 'REJECTED' && <Badge tone="danger">Rejected</Badge>}
                      {doc.reviewStatus === 'PENDING' && <Badge tone="neutral">Pending</Badge>}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void getDocUrl(doc.id)}
                        rightIcon={<ExternalLink className="size-3.5" />}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="grid gap-3">
              {company_.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3">
                  <div className="grid gap-0.5">
                    <p className="text-fg text-sm font-medium">{doc.typeCode.replace(/_/g, ' ')}</p>
                    <p className="text-fg-muted text-xs">{doc.fileName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.reviewStatus === 'ACCEPTED' && <Badge tone="success">Accepted</Badge>}
                    {doc.reviewStatus === 'REJECTED' && <Badge tone="danger">Rejected</Badge>}
                    {doc.reviewStatus === 'PENDING' && <Badge tone="neutral">Pending</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void getDocUrl(doc.id)}
                      rightIcon={<ExternalLink className="size-3.5" />}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {onboarding && printReady
        ? createPortal(
            <CompanyRegistrationFormPrint
              key={company_.id}
              company={company_}
              onboarding={onboarding}
              industryLabel={industryLabel}
              onReady={() => setPrintLabelsReady(true)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

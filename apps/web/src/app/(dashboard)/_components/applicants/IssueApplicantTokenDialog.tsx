'use client';

import { issueApplicantTokenSchema, type ApplicantTokenView } from '@jobbank/shared';
import { Ticket } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useState, type FormEvent } from 'react';
import { Button, Input, Select, type SelectOption } from '@/components/atoms';
import { CNICInput, FormField, Modal } from '@/components/molecules';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import { formatCnic } from '@/lib/format/cnic';
import { errorMessage, toFieldErrors, zodFieldErrors, type FieldErrors } from './form';
import { ApplicantTokenPrint } from './ApplicantTokenPrint';

interface Props {
  branches: SelectOption[];
  placement?: 'default' | 'sidebar';
}

/**
 * Token-only first counter (2026-11-07 reversal): collect a CNIC + name,
 * issue the day's next token number for the branch, and print the slip.
 * The full registration happens at a later step — this dialog deliberately
 * collects nothing else.
 */
export function IssueApplicantTokenDialog({ branches, placement = 'default' }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0]!.value : '');
  const [cnic, setCnic] = useState('');
  const [applicantName, setApplicantName] = useState('');
  const [token, setToken] = useState<ApplicantTokenView | null>(null);

  const resetForm = () => {
    setErrors({});
    setAlert(null);
    setBranchId(branches.length === 1 ? branches[0]!.value : '');
    setCnic('');
    setApplicantName('');
  };

  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      setToken(null);
      resetForm();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);
    const parsed = issueApplicantTokenSchema.safeParse({ branchId, cnic, applicantName });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { data } = await apiFetch<ApplicantTokenView>('/api/v1/applicants/tokens', {
        method: 'POST',
        body: parsed.data,
      });
      setToken(data);
    } catch (error) {
      if (error instanceof ApiClientError && error.issues.length > 0) {
        setErrors(toFieldErrors(error.issues));
      } else {
        setErrors({});
        setAlert(errorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  const issued = token
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(token.issuedAt))
    : '';

  return (
    <>
      <Modal
        title="Issue token"
        description="Take the applicant's CNIC number and name, issue the next token for today, and print it."
        open={open}
        onOpenChange={setDialogOpen}
        size="sm"
        trigger={
          <Button
            fullWidth={placement === 'sidebar'}
            leftIcon={placement === 'sidebar' ? <Ticket aria-hidden="true" /> : undefined}
          >
            Issue token
          </Button>
        }
      >
        {token ? (
          <div className="grid gap-5">
            <div className="border-border rounded-xl border p-4 text-center">
              <p className="text-fg-muted text-sm">Token number</p>
              <p className="text-4xl font-bold tracking-wide">{token.tokenCode}</p>
              <dl className="mt-4 grid gap-1 text-left text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Date and time</dt>
                  <dd>{issued}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">CNIC number</dt>
                  <dd className="font-mono">{formatCnic(token.cnic)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Applicant name</dt>
                  <dd>{token.applicantName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Branch</dt>
                  <dd>{token.branchName}</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => window.print()}>Print token</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setToken(null);
                  resetForm();
                }}
              >
                Issue another token
              </Button>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-5" onSubmit={submit} noValidate>
            {alert && (
              <p
                role="alert"
                className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm"
              >
                {alert}
              </p>
            )}
            {branches.length > 1 && (
              <FormField label="Branch" required error={errors.branchId}>
                <Select
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                  placeholder="Choose a branch"
                  options={branches}
                />
              </FormField>
            )}
            <FormField label="CNIC number" required error={errors.cnic}>
              <CNICInput value={cnic} onChange={(change) => setCnic(change.digits)} />
            </FormField>
            <FormField
              label="Applicant name"
              required
              error={errors.applicantName}
              hint="As on the CNIC"
            >
              <Input
                value={applicantName}
                onChange={(event) => setApplicantName(event.target.value)}
                placeholder="Full name"
                autoComplete="off"
                maxLength={120}
              />
            </FormField>
            <Button type="submit" disabled={loading}>
              {loading ? 'Issuing token…' : 'Generate token'}
            </Button>
          </form>
        )}
      </Modal>
      {token ? createPortal(<ApplicantTokenPrint token={token} />, document.body) : null}
    </>
  );
}

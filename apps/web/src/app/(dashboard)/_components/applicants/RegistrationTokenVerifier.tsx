'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/atoms';
import { FormField } from '@/components/molecules';
import type { ApplicantProfile } from '@/domains/applicant';
import { apiFetch } from '@/lib/api/client';
import { errorMessage } from './form';
import { RegistrationFormPrint } from './RegistrationFormPrint';

interface ApplicantMatch {
  id: string;
  fullName: string;
  cnic: string;
  branchName: string;
  status: string;
}

export function RegistrationTokenVerifier() {
  const [token, setToken] = useState('');
  const [applicant, setApplicant] = useState<ApplicantMatch | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [printProfile, setPrintProfile] = useState<ApplicantProfile | null>(null);
  const [printReady, setPrintReady] = useState(false);

  useEffect(() => {
    setPrintReady(true);
  }, []);

  const lookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setApplicant(null);
    setConfirmed(false);
    setPrintProfile(null);
    setLoading(true);
    try {
      const { data } = await apiFetch<ApplicantMatch>(
        '/api/v1/applicants/registration-token/lookup',
        {
          method: 'POST',
          body: { token },
        },
      );
      setApplicant(data);
      const { data: detail } = await apiFetch<ApplicantProfile>(`/api/v1/applicants/${data.id}`);
      if (detail.status !== 'DRAFT') {
        setMessage('This token is not linked to a Draft applicant profile.');
        return;
      }
      setPrintProfile(detail);
    } catch (error) {
      setApplicant(null);
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    setMessage(null);
    setLoading(true);
    try {
      const { data } = await apiFetch<ApplicantMatch>(
        '/api/v1/applicants/registration-token/confirm',
        { method: 'POST', body: { token } },
      );
      setApplicant(data);
      setConfirmed(true);
    } catch (error) {
      setApplicant(null);
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid max-w-xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-fg text-2xl font-semibold">Verify registration token</h1>
        <p className="text-fg-muted text-sm">
          Enter the code or scan the slip with a QR scanner connected as a keyboard.
        </p>
      </header>
      <form className="grid gap-4" onSubmit={lookup}>
        <FormField label="Registration token" required>
          <Input
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={token}
            onChange={(event) => setToken(event.target.value.toUpperCase())}
            placeholder="KHI-GULSHAN-20261105-001"
          />
        </FormField>
        <Button type="submit" loading={loading} disabled={!token.trim()}>
          Look up token
        </Button>
      </form>

      {message && (
        <p role="alert" className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm">
          {message}
        </p>
      )}

      {applicant && (
        <section className="border-border bg-surface grid gap-4 rounded-xl border p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-fg-muted text-xs">Applicant</p>
              <p className="text-fg font-medium">{applicant.fullName}</p>
            </div>
            <div>
              <p className="text-fg-muted text-xs">CNIC</p>
              <p className="text-fg font-medium">{applicant.cnic}</p>
            </div>
            <div>
              <p className="text-fg-muted text-xs">Branch</p>
              <p className="text-fg font-medium">{applicant.branchName}</p>
            </div>
            <div>
              <p className="text-fg-muted text-xs">Profile status</p>
              <p className="text-fg font-medium">{applicant.status}</p>
            </div>
          </div>
          {confirmed ? (
            <p
              role="status"
              className="bg-success-soft text-success-soft-fg rounded-lg px-4 py-3 text-sm"
            >
              Token confirmed and marked as used.
            </p>
          ) : (
            <div className="no-print flex flex-wrap gap-2">
              <Button onClick={() => void confirm()} loading={loading}>
                Confirm applicant at this counter
              </Button>
            </div>
          )}
          {confirmed && printProfile && (
            <div className="no-print">
              <Button onClick={() => window.print()}>Print registration form</Button>
            </div>
          )}
        </section>
      )}
      {confirmed &&
        printProfile &&
        printReady &&
        createPortal(
          <RegistrationFormPrint
            profile={printProfile}
            branchName={printProfile.branch?.name ?? applicant?.branchName ?? ''}
          />,
          document.body,
        )}
    </div>
  );
}

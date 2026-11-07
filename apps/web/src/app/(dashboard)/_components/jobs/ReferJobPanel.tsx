'use client';

import { Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Select, Textarea, type SelectOption } from '@/components/atoms';
import { FormField, toast } from '@/components/molecules';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import type { JobReferralView } from '@/domains/job';

interface Props {
  jobId: string;
  /** Verified companies in this staff member's scope. */
  targets: SelectOption[];
  initialReferrals: JobReferralView[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Staff refers this job to an employer company. The employer sees the job
 * in their Jobs list from the moment the referral is made — and only then.
 */
export function ReferJobPanel({ jobId, targets, initialReferrals }: Props) {
  const [companyId, setCompanyId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<JobReferralView[]>(initialReferrals);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId) {
      setAlert('Choose an employer to refer this job to.');
      return;
    }
    setAlert(null);
    setLoading(true);
    try {
      const { data } = await apiFetch<JobReferralView>(`/api/v1/jobs/${jobId}/referrals`, {
        method: 'POST',
        body: { companyId, note: note.trim() ? note.trim() : undefined },
      });
      setReferrals((prev) =>
        prev.some((r) => r.companyId === data.companyId) ? prev : [data, ...prev],
      );
      setCompanyId('');
      setNote('');
      toast.success(`Job referred to ${data.companyName ?? 'employer'}.`);
    } catch (error) {
      setAlert(
        error instanceof ApiClientError ? error.message : 'Could not refer this job. Try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <h2 className="text-fg mb-1 flex items-center gap-2 font-semibold">
        <Send className="size-4" style={{ color: 'var(--primary)' }} />
        Refer to employer
      </h2>
      <p className="text-fg-muted mb-4 text-sm">
        Share this job with a specific employer. They will see it in their Jobs list; employers
        without a referral cannot see it.
      </p>

      {targets.length === 0 ? (
        <p className="text-fg-muted text-sm">No verified employers in your scope yet.</p>
      ) : (
        <form className="grid gap-4" onSubmit={submit} noValidate>
          {alert && (
            <p
              role="alert"
              className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm"
            >
              {alert}
            </p>
          )}
          <FormField label="Employer" required hint="Only verified companies are listed">
            <Select
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              placeholder="Choose an employer"
              options={targets.filter((t) => !referrals.some((r) => r.companyId === t.value))}
            />
          </FormField>
          <FormField label="Note for the employer" hint="Optional — shown to the employer">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Urgent — the employer asked for riders this week."
              rows={2}
              maxLength={500}
            />
          </FormField>
          <div>
            <Button type="submit" loading={loading} disabled={!companyId}>
              <Send className="mr-1.5 size-4" />
              Refer job
            </Button>
          </div>
        </form>
      )}

      {referrals.length > 0 && (
        <div className="mt-5 grid gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <p
            className="text-xs font-medium tracking-wide uppercase"
            style={{ color: 'var(--fg-subtle)' }}
          >
            Referred to ({referrals.length})
          </p>
          {referrals.map((r) => (
            <div key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="text-fg font-medium">{r.companyName ?? 'Employer'}</span>
              <span className="text-fg-muted text-xs">
                {formatDate(r.referredAt)}
                {r.referredByName ? ` · by ${r.referredByName}` : ''}
              </span>
              {r.note && <p className="text-fg-muted w-full text-xs">“{r.note}”</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

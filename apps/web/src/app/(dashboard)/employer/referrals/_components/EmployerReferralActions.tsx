'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Textarea } from '@/components/atoms';
import { FormField, Modal, toast } from '@/components/molecules';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import type { ApplicationView } from '@/domains/placement';

interface Props {
  applicationId: string;
  status: ApplicationView['status'];
  companyName: string;
  jobTitle: string;
}

export function EmployerReferralActions({ applicationId, status, companyName, jobTitle }: Props) {
  const router = useRouter();

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'HOLD' | 'ACCEPTED' | 'REJECTED' | null>(
    null,
  );

  const [decisionNote, setDecisionNote] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDecision(decision: 'HOLD' | 'ACCEPTED' | 'REJECTED') {
    setLoading(true);
    try {
      await apiFetch(`/api/v1/applications/${applicationId}/employer-decision`, {
        method: 'POST',
        body: { decision, note: decisionNote || undefined },
      });
      const labels = {
        HOLD: 'On hold',
        ACCEPTED: 'Offer extended',
        REJECTED: 'Applicant not selected',
      };
      toast.success(labels[decision]);
      setDecisionOpen(false);
      setPendingDecision(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to record decision');
    } finally {
      setLoading(false);
    }
  }

  // Employer interview scheduling lives in EmployerInterviewScheduler
  // (audit H-09): the employer schedules, reschedules, postpones or cancels
  // their own interview here; the applicant is notified of every change.
  // FORWARDED is decidable on the server too; the interview states are the
  // employer's own interview states.
  const canDecide =
    status === 'FORWARDED' ||
    status === 'ON_HOLD' ||
    status === 'EMPLOYER_INTERVIEW_SCHEDULED' ||
    status === 'EMPLOYER_INTERVIEW_POSTPONED' ||
    status === 'EMPLOYER_INTERVIEW_CANCELLED';

  if (!canDecide) {
    return <p className="text-fg-muted text-sm">No actions available for this status.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setPendingDecision('HOLD');
            setDecisionOpen(true);
          }}
        >
          Put on Hold
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setPendingDecision('ACCEPTED');
            setDecisionOpen(true);
          }}
        >
          Extend Offer
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            setPendingDecision('REJECTED');
            setDecisionOpen(true);
          }}
        >
          Not Selected
        </Button>
      </div>

      {/* Decision Modal */}
      <Modal
        open={decisionOpen}
        onOpenChange={(open) => {
          setDecisionOpen(open);
          if (!open) setPendingDecision(null);
        }}
        title={
          pendingDecision === 'ACCEPTED'
            ? 'Extend Job Offer'
            : pendingDecision === 'REJECTED'
              ? 'Mark as Not Selected'
              : 'Put Application on Hold'
        }
      >
        <div className="grid gap-4">
          <p className="text-fg-muted text-sm">
            {pendingDecision === 'ACCEPTED'
              ? `This will send a job offer notification to the applicant for ${jobTitle} at ${companyName}.`
              : pendingDecision === 'REJECTED'
                ? 'The applicant will be notified that they were not selected.'
                : 'The applicant will be notified that their application is on hold.'}
          </p>
          <FormField label="Note (optional)">
            <Textarea
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              rows={3}
              placeholder="Any additional context…"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDecisionOpen(false);
                setPendingDecision(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={loading || !pendingDecision}
              onClick={() => pendingDecision && handleDecision(pendingDecision)}
              variant={pendingDecision === 'REJECTED' ? 'danger' : 'primary'}
            >
              {loading ? 'Saving…' : 'Confirm'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

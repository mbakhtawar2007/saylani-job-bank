'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/atoms';
import { Modal, toast } from '@/components/molecules';
import { apiFetch, friendlyApiError } from '@/lib/api/client';

interface Props {
  applicationId: string;
  jobTitle: string;
}

/**
 * Accept a job offer. This is the hire path: the application becomes HIRED
 * and one vacancy fills. The employer is notified.
 */
export function AcceptOfferButton({ applicationId, jobTitle }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    setLoading(true);
    try {
      await apiFetch(`/api/v1/applications/${applicationId}/accept`, { method: 'POST' });
      toast.success('Offer accepted — congratulations!');
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(friendlyApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        Accept this offer
      </Button>

      <Modal open={open} onOpenChange={setOpen} title="Accept Job Offer">
        <div className="grid gap-4">
          <p className="text-fg-muted text-sm">
            Accepting the offer for <span className="text-fg font-semibold">{jobTitle}</span> marks
            you as hired for this job. The employer will be notified.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAccept()} disabled={loading}>
              {loading ? 'Accepting…' : 'Accept Offer'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

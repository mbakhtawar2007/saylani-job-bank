'use client';

import type { MasterDataItem } from '@jobbank/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Select, Textarea } from '@/components/atoms';
import { FormField, Modal, toast } from '@/components/molecules';
import { apiFetch, friendlyApiError } from '@/lib/api/client';

interface Props {
  applicationId: string;
}

/**
 * H19 — refusing an offer needs a master-data REFUSAL_REASON code, not free
 * text: the server 422s a free-text `reason`. The options come from the
 * reference list (active items only for non-managers); a reason whose meta
 * requires a note makes the note field required, matching the server check.
 */
export function RefuseOfferButton({ applicationId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [reasons, setReasons] = useState<MasterDataItem[]>([]);
  const [reasonsLoading, setReasonsLoading] = useState(false);
  const [reasonsError, setReasonsError] = useState(false);

  async function loadReasons() {
    setReasonsLoading(true);
    setReasonsError(false);
    try {
      const { data } = await apiFetch<MasterDataItem[]>('/api/v1/master-data?type=REFUSAL_REASON');
      setReasons(data ?? []);
    } catch {
      setReasonsError(true);
    } finally {
      setReasonsLoading(false);
    }
  }

  // Load the reference list when the dialog opens (not on page load — there
  // is one button per pending offer on the page).
  useEffect(() => {
    if (open) void loadReasons();
  }, [open]);

  const selected = reasons.find((r) => r.code === reasonCode);
  const noteRequired =
    (selected?.meta as { requiresNote?: boolean } | undefined)?.requiresNote === true;
  const noteValid = !noteRequired || note.trim().length >= 5;

  async function handleRefuse(e: FormEvent) {
    e.preventDefault();
    if (!reasonCode || !noteValid) return;
    setLoading(true);
    try {
      await apiFetch(`/api/v1/applications/${applicationId}/refuse`, {
        method: 'POST',
        body: { reasonCode, note: note.trim() || undefined },
      });
      toast.success('Offer refused');
      setOpen(false);
      setReasonCode('');
      setNote('');
      router.refresh();
    } catch (err) {
      toast.error(friendlyApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Refuse this offer
      </Button>

      <Modal open={open} onOpenChange={setOpen} title="Refuse Job Offer">
        <form onSubmit={handleRefuse} className="grid gap-4">
          <p className="text-fg-muted text-sm">
            Please tell the employer why you are refusing this offer. They may respond with
            questions via chat.
          </p>
          {reasonsError ? (
            <div className="grid gap-2">
              <p className="text-danger text-sm">
                Could not load the list of reasons. Please try again.
              </p>
              <div>
                <Button type="button" variant="secondary" onClick={() => void loadReasons()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <FormField label="Reason" required>
              <Select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                options={reasons.map((r) => ({ value: r.code, label: r.label }))}
                placeholder={reasonsLoading ? 'Loading reasons…' : 'Choose a reason'}
                disabled={reasonsLoading || reasons.length === 0}
                required
              />
            </FormField>
          )}
          <FormField
            label={noteRequired ? 'Note (required for this reason)' : 'Additional note (optional)'}
            required={noteRequired}
          >
            <Textarea
              placeholder={
                noteRequired
                  ? 'Add a short note for this reason (at least 5 characters)…'
                  : 'Any extra context…'
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              required={noteRequired}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={loading || !reasonCode || !noteValid || reasonsError}
            >
              {loading ? 'Refusing…' : 'Refuse Offer'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

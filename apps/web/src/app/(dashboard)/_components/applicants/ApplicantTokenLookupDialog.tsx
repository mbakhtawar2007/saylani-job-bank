'use client';

import { karachiDay, type ApplicantTokenView } from '@jobbank/shared';
import { Printer, Search, UserRoundPlus, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useState, type FormEvent } from 'react';
import { Button, Input, Select, type SelectOption } from '@/components/atoms';
import { CNICInput, FormField, Modal } from '@/components/molecules';
import { apiFetch } from '@/lib/api/client';
import { errorMessage } from './form';
import { ApplicantTokenSlip } from './ApplicantTokenSlip';
import { RegisterApplicantDialog } from './RegisterApplicantDialog';

interface Props {
  branches: SelectOption[];
  placement?: 'default' | 'sidebar';
}

const STATUS_LABELS: Record<ApplicantTokenView['status'], string> = {
  ISSUED: 'Issued',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/**
 * Step 2 token lookup / reprint (2026-11-08): find a token by its code, by
 * CNIC + branch + day, or list a whole branch-day, then reprint the approved
 * slip, cancel it, or complete the full registration for it. The slip itself
 * is the approved format — this dialog only wraps it with its status.
 */
export function ApplicantTokenLookupDialog({ branches, placement = 'default' }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [tokenCode, setTokenCode] = useState('');
  const [cnic, setCnic] = useState('');
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0]!.value : '');
  const [day, setDay] = useState(karachiDay());
  const [results, setResults] = useState<ApplicantTokenView[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const selected = results?.find((token) => token.id === selectedId) ?? null;

  const resetSearch = () => {
    setAlert(null);
    setResults(null);
    setSelectedId(null);
    setConfirmingCancel(false);
  };

  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Same rule as the issue dialog (N8): no stale slip stays mounted.
      setResults(null);
      setSelectedId(null);
      setConfirmingCancel(false);
      setRegisterOpen(false);
    }
  };

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);
    setConfirmingCancel(false);
    const params = new URLSearchParams();
    if (tokenCode.trim()) {
      params.set('tokenCode', tokenCode.trim().toUpperCase());
    } else if (cnic) {
      if (!branchId) {
        setAlert('Choose a branch to look up by CNIC.');
        return;
      }
      params.set('cnic', cnic);
      params.set('branchId', branchId);
      if (day) params.set('day', day);
    } else {
      if (!branchId) {
        setAlert('Enter a token code, or choose a branch to list its tokens.');
        return;
      }
      params.set('branchId', branchId);
      if (day) params.set('day', day);
    }
    setLoading(true);
    try {
      const { data } = await apiFetch<ApplicantTokenView[]>(
        `/api/v1/applicants/tokens?${params.toString()}`,
      );
      setResults(data);
      setSelectedId(data.length === 1 ? data[0]!.id : null);
      if (data.length === 0) setAlert('No token matches this search.');
    } catch (error) {
      setResults(null);
      setSelectedId(null);
      setAlert(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const cancelSelected = async () => {
    if (!selected) return;
    setCancelling(true);
    setAlert(null);
    try {
      const { data } = await apiFetch<ApplicantTokenView>(
        `/api/v1/applicants/tokens/${selected.id}/cancel`,
        { method: 'POST', body: {} },
      );
      setResults((current) =>
        (current ?? []).map((token) => (token.id === data.id ? data : token)),
      );
      setConfirmingCancel(false);
    } catch (error) {
      setAlert(errorMessage(error));
    } finally {
      setCancelling(false);
    }
  };

  const startRegistration = () => {
    if (!selected) return;
    setRegisterOpen(true);
  };

  // Re-run the last search after the registration dialog closes, so a token
  // completed there shows as COMPLETED here without a manual re-search.
  const refreshAfterRegistration = async () => {
    if (!selected) return;
    try {
      const { data } = await apiFetch<ApplicantTokenView[]>(
        `/api/v1/applicants/tokens?tokenCode=${encodeURIComponent(selected.tokenCode)}`,
      );
      if (data.length > 0) {
        setResults((current) =>
          (current ?? []).map((token) => (token.id === data[0]!.id ? data[0]! : token)),
        );
      }
    } catch {
      // The lookup already showed the token; a failed refresh is not an error here.
    }
  };

  return (
    <>
      <Modal
        title="Find token"
        description="Look up a token to reprint its slip, cancel it, or complete the full registration for it."
        open={open}
        onOpenChange={setDialogOpen}
        size="lg"
        trigger={
          <Button
            variant="secondary"
            fullWidth={placement === 'sidebar'}
            leftIcon={placement === 'sidebar' ? <Search aria-hidden="true" /> : undefined}
          >
            Find token
          </Button>
        }
      >
        <div className="grid gap-5">
          <form className="grid gap-4" onSubmit={search} noValidate>
            {alert && (
              <p
                role="alert"
                className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm"
              >
                {alert}
              </p>
            )}
            <FormField label="Token code" hint="For example KHI-GULSHAN-007">
              <Input
                value={tokenCode}
                onChange={(event) => setTokenCode(event.target.value)}
                placeholder="KHI-GULSHAN-007"
                autoComplete="off"
                autoFocus
              />
            </FormField>
            <p className="text-fg-muted text-center text-sm">or look up by CNIC and branch</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="CNIC number" hint="13 digits, as on the CNIC">
                <CNICInput value={cnic} onChange={(change) => setCnic(change.digits)} />
              </FormField>
              {branches.length > 1 && (
                <FormField label="Branch">
                  <Select
                    value={branchId}
                    onChange={(event) => setBranchId(event.target.value)}
                    placeholder="Choose a branch"
                    options={branches}
                  />
                </FormField>
              )}
              <FormField label="Day" hint="Pakistan calendar day">
                <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
              </FormField>
            </div>
            <Button
              type="submit"
              fullWidth
              leftIcon={<Search aria-hidden="true" />}
              disabled={loading}
            >
              {loading ? 'Searching…' : 'Find token'}
            </Button>
            {(tokenCode || cnic || branchId) && (
              <Button type="button" variant="secondary" onClick={resetSearch}>
                Clear search
              </Button>
            )}
          </form>

          {results !== null && results.length > 1 && (
            <div className="grid gap-2">
              <h2 className="text-fg font-semibold">
                {results.length} tokens on {day}
              </h2>
              <ul className="grid gap-1">
                {results.map((token) => (
                  <li key={token.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(token.id);
                        setConfirmingCancel(false);
                      }}
                      className="text-fg hover:bg-surface-muted w-full rounded-lg border px-3 py-2 text-left text-sm"
                    >
                      <span className="font-semibold">{token.tokenCode}</span>{' '}
                      <span className="text-fg-muted">
                        {token.applicantName} · {STATUS_LABELS[token.status]}
                        {token.expired && token.status === 'ISSUED' ? ' · Expired' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selected && (
            <div className="grid gap-4">
              <p className="text-fg text-sm">
                <span className="font-semibold">{selected.tokenCode}</span> ·{' '}
                {STATUS_LABELS[selected.status]}
                {selected.status === 'ISSUED' && selected.expired
                  ? ' · Expired at the end of its issue day — issue a new token instead of completing this one.'
                  : ''}
                {selected.status === 'COMPLETED' && selected.applicantId
                  ? ' · Registration completed.'
                  : ''}
              </p>
              {selected.status === 'ISSUED' && selected.expired && (
                <p
                  role="alert"
                  className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm"
                >
                  This token expired at the end of its issue day. It can be cancelled, but it cannot
                  complete a registration.
                </p>
              )}
              <ApplicantTokenSlip token={selected} />
              <div className="grid gap-2">
                <Button
                  fullWidth
                  leftIcon={<Printer aria-hidden="true" />}
                  onClick={() => window.print()}
                >
                  Print token
                </Button>
                {selected.status === 'ISSUED' && !selected.expired && (
                  <Button
                    fullWidth
                    variant="secondary"
                    leftIcon={<UserRoundPlus aria-hidden="true" />}
                    onClick={startRegistration}
                  >
                    Complete registration
                  </Button>
                )}
                {selected.status === 'ISSUED' &&
                  (confirmingCancel ? (
                    <div className="grid gap-2">
                      <p className="text-fg-muted text-center text-sm">
                        Cancel {selected.tokenCode}? The applicant can be issued a new token
                        afterwards.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          fullWidth
                          variant="secondary"
                          onClick={() => setConfirmingCancel(false)}
                        >
                          Keep token
                        </Button>
                        <Button
                          fullWidth
                          onClick={() => void cancelSelected()}
                          disabled={cancelling}
                        >
                          {cancelling ? 'Cancelling…' : 'Yes, cancel token'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      fullWidth
                      variant="secondary"
                      leftIcon={<X aria-hidden="true" />}
                      onClick={() => setConfirmingCancel(true)}
                    >
                      Cancel token
                    </Button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
      {selected
        ? createPortal(
            <div className="applicant-token-print-root">
              <ApplicantTokenSlip token={selected} />
            </div>,
            document.body,
          )
        : null}
      <RegisterApplicantDialog
        branches={branches}
        token={selected}
        open={registerOpen}
        onOpenChange={(next) => {
          setRegisterOpen(next);
          if (!next) void refreshAfterRegistration();
        }}
      />
    </>
  );
}

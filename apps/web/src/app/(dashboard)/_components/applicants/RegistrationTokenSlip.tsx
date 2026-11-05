'use client';

import { Button } from '@/components/atoms';
import { formatDate } from '@/lib/format/date';
import { RegistrationTokenQr } from './RegistrationTokenQr';

export interface RegistrationTokenSlipData {
  applicantName: string;
  token: string;
  branchName: string;
  issuedAt: string;
  expiresAt: string;
}

export function RegistrationTokenSlip({
  slip,
  onDone,
}: {
  slip: RegistrationTokenSlipData;
  onDone: () => void;
}) {
  return (
    <div className="registration-token-print-slip grid justify-items-center gap-4 rounded-lg border p-6 text-center">
      <div className="grid gap-1">
        <p className="text-sm font-semibold">Saylani Job Bank · Applicant Registration</p>
        <h2 className="text-xl font-bold">{slip.applicantName}</h2>
        <p className="text-sm">{slip.branchName}</p>
        <p className="text-sm">Issued {formatDate(slip.issuedAt)}</p>
      </div>
      <p className="registration-token-code font-mono font-bold">{slip.token}</p>
      <RegistrationTokenQr value={slip.token} />
      <p className="text-sm">Valid for registration on the issue date only.</p>
      <div className="no-print flex gap-2">
        <Button onClick={() => window.print()}>Print token</Button>
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

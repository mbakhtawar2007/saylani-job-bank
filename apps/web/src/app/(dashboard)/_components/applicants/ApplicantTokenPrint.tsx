'use client';

import type { ApplicantTokenView } from '@jobbank/shared';
import { formatCnic } from '@/lib/format/cnic';

/**
 * Print-only token slip, portalled to document.body (never rendered inside
 * the Modal: printing from inside a modal put the slip on a second sheet).
 * The matching @media print rules live in design-system/global.css — only
 * this root is visible on paper, and the slip fits on one page.
 */
export function ApplicantTokenPrint({ token }: { token: ApplicantTokenView }) {
  const issued = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(token.issuedAt));

  return (
    <div className="applicant-token-print-root">
      <article className="applicant-token-print-slip">
        <header>
          <p>Saylani Job Bank</p>
          <p>Applicant token</p>
        </header>
        <p className="applicant-token-print-number">{token.tokenCode}</p>
        <dl>
          <div>
            <dt>Token number</dt>
            <dd>{token.tokenNumber}</dd>
          </div>
          <div>
            <dt>Date and time</dt>
            <dd>{issued}</dd>
          </div>
          <div>
            <dt>CNIC number</dt>
            <dd>{formatCnic(token.cnic)}</dd>
          </div>
          <div>
            <dt>Applicant name</dt>
            <dd>{token.applicantName}</dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd>{token.branchName}</dd>
          </div>
        </dl>
        <p>Please keep this token and wait to be called.</p>
      </article>
    </div>
  );
}

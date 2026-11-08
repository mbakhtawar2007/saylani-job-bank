'use client';

import type { ApplicantTokenView } from '@jobbank/shared';
import { formatPkMobileDisplay } from '@/lib/format/phone';

/**
 * Token slip styled exactly like the approved demo: Saylani logo top-left,
 * "TOKEN SLIP" badge, big two-digit token number, detail rows, the Job Bank
 * logo as a centre watermark, and the dashed footer. The same markup
 * renders on screen in the issue dialog and as the print-only portal —
 * the matching styles live in design-system/global.css, with @media print
 * rules that print only this slip, on one page.
 *
 * Values are the live token: the big number is the day's token number,
 * zero-padded to two digits; the Applicant ID row shows the token code,
 * because there is no applicant record yet at token time.
 */
export function ApplicantTokenSlip({ token }: { token: ApplicantTokenView }) {
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(token.issuedAt));
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(token.issuedAt));

  return (
    <article className="token-slip">
      <img
        className="token-slip__watermark"
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width={2172}
        height={724}
      />
      <div className="token-slip__content">
        <header className="token-slip__header">
          <img
            className="token-slip__logo"
            src="/saylani-logo.png"
            alt="Saylani"
            width={563}
            height={146}
          />
          <span className="token-slip__badge">TOKEN SLIP</span>
        </header>
        <div className="token-slip__title">
          <h1>Saylani Job Bank</h1>
          <p>Connecting Talent with Opportunity</p>
        </div>
        <hr className="token-slip__divider" />
        <div className="token-slip__number">
          <p className="token-slip__number-label">TOKEN NUMBER</p>
          <p className="token-slip__number-value">{String(token.tokenNumber).padStart(2, '0')}</p>
        </div>
        <dl className="token-slip__rows">
          <div className="token-slip__row">
            <dt className="token-slip__key">Applicant ID</dt>
            <dd className="token-slip__value">{token.tokenCode}</dd>
          </div>
          <div className="token-slip__row">
            <dt className="token-slip__key">Date &amp; Time</dt>
            <dd className="token-slip__value">
              {date} • {time}
            </dd>
          </div>
          <div className="token-slip__row">
            <dt className="token-slip__key">NIC</dt>
            <dd className="token-slip__value">{token.cnic}</dd>
          </div>
          <div className="token-slip__row">
            <dt className="token-slip__key">Name</dt>
            <dd className="token-slip__value">{token.applicantName}</dd>
          </div>
          <div className="token-slip__row">
            <dt className="token-slip__key">Phone</dt>
            <dd className="token-slip__value">{formatPkMobileDisplay(token.phone)}</dd>
          </div>
        </dl>
        <footer className="token-slip__footer">
          <p>Please keep this token and wait to be called.</p>
          <small>SAYLANI JOB BANK</small>
        </footer>
      </div>
    </article>
  );
}

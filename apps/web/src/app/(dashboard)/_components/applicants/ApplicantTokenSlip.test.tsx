import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApplicantTokenView } from '@jobbank/shared';
import { ApplicantTokenSlip } from './ApplicantTokenSlip';

const token: ApplicantTokenView = {
  id: '00000000-0000-0000-0000-000000000001',
  tokenNumber: 1,
  tokenCode: 'KHI-GULSHAN-001',
  branchId: '00000000-0000-0000-0000-000000000002',
  branchCode: 'KHI-GULSHAN',
  branchName: 'Karachi — Gulshan-e-Iqbal',
  cnic: '4240127739744',
  applicantName: 'Test Applicant',
  // 19:39:20 PKT on 2026-11-07.
  issuedAt: '2026-11-07T14:39:20.000Z',
  status: 'ISSUED',
  applicantId: null,
};

describe('ApplicantTokenSlip', () => {
  it('renders the demo slip: badge, padded number, date, time, raw NIC, name', () => {
    render(<ApplicantTokenSlip token={token} />);

    expect(screen.getByText('TOKEN SLIP')).toBeInTheDocument();
    expect(screen.getByText('Saylani Job Bank')).toBeInTheDocument();
    expect(screen.getByText('Connecting Talent with Opportunity')).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('KHI-GULSHAN-001')).toBeInTheDocument();
    expect(screen.getByText('07/11/2026')).toBeInTheDocument();
    expect(screen.getByText('07:39:20 PM')).toBeInTheDocument();
    expect(screen.getByText('4240127739744')).toBeInTheDocument();
    expect(screen.getByText('Test Applicant')).toBeInTheDocument();
    expect(screen.getByText('Please keep this token and wait to be called.')).toBeInTheDocument();
    expect(screen.getByText('SAYLANI JOB BANK')).toBeInTheDocument();
    expect(screen.getByAltText('Saylani')).toHaveAttribute('src', '/saylani-logo.png');
  });

  it('pads two-digit token numbers and leaves larger numbers alone', () => {
    const { rerender } = render(<ApplicantTokenSlip token={{ ...token, tokenNumber: 12 }} />);
    expect(screen.getByText('12')).toBeInTheDocument();

    rerender(<ApplicantTokenSlip token={{ ...token, tokenNumber: 123 }} />);
    expect(screen.getByText('123')).toBeInTheDocument();
  });
});

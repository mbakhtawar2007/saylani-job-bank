import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SuperAdminJobsPage from './page';

const { listCompanies, listJobs, listMasterData } = vi.hoisted(() => ({
  listCompanies: vi.fn(),
  listJobs: vi.fn(),
  listMasterData: vi.fn(),
}));

vi.mock('@/domains/auth', () => ({
  requireRole: vi.fn().mockResolvedValue({
    actor: { permissions: new Set(['job:manage']) },
  }),
}));
vi.mock('@/domains/company', () => ({ listCompanies }));
vi.mock('@/domains/job', () => ({ listJobs }));
vi.mock('@/domains/settings', () => ({ listMasterData }));
vi.mock('@/app/(dashboard)/_components/jobs/JobManagementPanel', () => ({
  JobManagementPanel: ({
    canManage,
    companies,
    categories,
  }: {
    canManage: boolean;
    companies: { id: string; name: string }[];
    categories: { code: string; label: string }[];
  }) => (
    <div>
      <span>{canManage ? 'Management enabled' : 'Read only'}</span>
      <span>{companies[0]?.name}</span>
      <span>{categories[0]?.label}</span>
    </div>
  ),
}));

describe('Super Admin jobs page', () => {
  it('supplies verified companies and job categories to the management panel', async () => {
    listJobs.mockResolvedValue({ items: [], pagination: { total: 0 } });
    listCompanies.mockResolvedValue({
      items: [{ id: 'company-id', legalName: 'Verified company' }],
    });
    listMasterData.mockResolvedValue([{ code: 'RETAIL_SALES', label: 'Retail sales' }]);

    render(await SuperAdminJobsPage());

    expect(screen.getByText('Management enabled')).toBeInTheDocument();
    expect(screen.getByText('Verified company')).toBeInTheDocument();
    expect(screen.getByText('Retail sales')).toBeInTheDocument();
    expect(listCompanies).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filters: { status: 'VERIFIED' } }),
    );
    expect(listMasterData).toHaveBeenCalledWith(expect.anything(), { type: 'JOB_CATEGORY' });
  });
});

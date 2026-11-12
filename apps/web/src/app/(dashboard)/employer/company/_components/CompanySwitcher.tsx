'use client';

import { useRouter } from 'next/navigation';
import { Button, Select } from '@/components/atoms';
import type { CompanyView } from '@/domains/company';
import { setActiveCompanyCookie } from '@/lib/active-company';

/**
 * The employer's companies (at most two): pick which one the dashboard, the
 * wizard and the /me API routes act on, and register a second one while
 * there is still room. The pick is stored in the active-company cookie;
 * the server only honours it for a company this account belongs to.
 */
export function CompanySwitcher({
  companies,
  activeCompanyId,
  canRegisterAnother,
}: {
  companies: CompanyView[];
  activeCompanyId: string | null;
  canRegisterAnother: boolean;
}) {
  const router = useRouter();
  if (companies.length === 0) return null;
  const activeId = activeCompanyId ?? companies[0]!.id;

  return (
    <div className="border-border bg-surface flex flex-wrap items-end justify-between gap-3 rounded-xl border p-4">
      <div className="grid min-w-52 flex-1 gap-1">
        <label htmlFor="active-company" className="text-sm font-medium">
          Your company
        </label>
        <Select
          id="active-company"
          value={activeId}
          onChange={(event) => {
            setActiveCompanyCookie(event.target.value);
            router.refresh();
          }}
          options={companies.map((c) => ({
            value: c.id,
            label: `${c.details.legalName} — ${c.status.charAt(0) + c.status.slice(1).toLowerCase()}`,
          }))}
        />
        <p className="text-fg-muted text-xs">
          {companies.length === 1
            ? 'One email can register up to two companies.'
            : 'You have two registered companies — the most one email can hold.'}
        </p>
      </div>
      {canRegisterAnother && (
        <Button variant="secondary" onClick={() => router.push('/employer/company?new=1')}>
          Register another company
        </Button>
      )}
    </div>
  );
}

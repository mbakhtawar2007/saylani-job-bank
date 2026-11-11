'use client';

import { UserCog } from 'lucide-react';
import NextLink from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { setApiOnBehalfOfCompany } from '@/lib/api/client';

/** Every API call under this banner is made for the company, and logged under the staff member. */
export function ActingForEmployer({
  companyId,
  companyName,
  consoleHref,
  children,
}: {
  companyId: string;
  companyName: string;
  consoleHref: string;
  children: ReactNode;
}) {
  // Set during the first render, so the screens' first requests already carry it.
  useState(() => setApiOnBehalfOfCompany(companyId));
  useEffect(() => {
    setApiOnBehalfOfCompany(companyId);
    return () => setApiOnBehalfOfCompany(null);
  }, [companyId]);

  return (
    <div className="grid w-full gap-5">
      <div
        role="status"
        className="bg-warning-soft text-warning-soft-fg flex flex-wrap items-start gap-2 rounded-xl px-4 py-3 text-sm"
      >
        <UserCog className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          You are acting for{' '}
          <NextLink href={consoleHref} className="font-semibold underline underline-offset-2">
            {companyName}
          </NextLink>
          . Only record what the employer told you. Everything is saved under your name.
        </p>
      </div>
      {children}
    </div>
  );
}

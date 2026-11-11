'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ComponentProps } from 'react';
import { setApiOnBehalfOf } from '@/lib/api/client';
import { CounterModeContext } from '../../applicant/_components/counter-mode';
import { ProfileWizard } from '../../applicant/_components/ProfileWizard';

/** The job seeker profile screens, with every API call made on behalf of this candidate. */
export function CounterWizard({
  applicantId,
  detailHref,
  ...wizard
}: Omit<ComponentProps<typeof ProfileWizard>, 'onReturnToOverview'> & {
  applicantId: string;
  detailHref: string;
}) {
  const router = useRouter();
  // Set during the first render, so the steps' first requests already carry it.
  useState(() => setApiOnBehalfOf(applicantId));
  useEffect(() => {
    setApiOnBehalfOf(applicantId);
    return () => setApiOnBehalfOf(null);
  }, [applicantId]);

  return (
    <CounterModeContext.Provider value={true}>
      <ProfileWizard
        {...wizard}
        onReturnToOverview={() => {
          setApiOnBehalfOf(null);
          router.push(detailHref);
          router.refresh();
        }}
      />
    </CounterModeContext.Provider>
  );
}

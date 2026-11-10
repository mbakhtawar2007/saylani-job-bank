import type { Metadata } from 'next';
import { requireRole } from '@/domains/auth';
import { RegistrationPrintClient } from './RegistrationPrintClient';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Print registration form',
  robots: { index: false, follow: false },
};

export default async function RegistrationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { actor } = await requireRole('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF');
  if (!actor.permissions.has('applicant:manage')) redirect('/forbidden');
  const { id } = await params;
  return <RegistrationPrintClient applicantId={id} />;
}

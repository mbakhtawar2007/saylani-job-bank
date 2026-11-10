import type { Metadata } from 'next';
import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getApplicantForStaff, resolveApplicantVerification } from '@/domains/applicant';
import { ForbiddenError, ScopeViolationError } from '@/domains/shared/errors';
import { consumeRateLimit } from '@/domains/shared/rate-limit';
import { getServerAuthState } from '@/domains/auth';
import { formatDate } from '@/lib/format/date';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Verify registration',
  robots: { index: false, follow: false },
};

function VerificationMessage({ limited = false }: { limited?: boolean }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-5 px-6 py-12">
      <Image
        src="/logo.png"
        width={160}
        height={80}
        alt="Saylani"
        className="h-14 w-auto object-contain"
      />
      <section className="border-border bg-surface shadow-card grid gap-3 rounded-xl border p-6">
        <h1 className="text-fg text-xl font-semibold">
          {limited ? 'Please try again later' : 'Unable to verify this registration record'}
        </h1>
        <p className="text-fg-muted text-sm">
          {limited
            ? 'Too many verification attempts. Please wait a while and try again.'
            : 'Please contact the issuing Saylani branch.'}
        </p>
      </section>
    </main>
  );
}

export default async function ApplicantVerificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, requestHeaders] = await Promise.all([params, headers()]);
  const ip =
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    requestHeaders.get('x-real-ip') ||
    null;
  if (ip) {
    const limit = await consumeRateLimit('applicant-qr-verify', ip, {
      limit: 30,
      windowSeconds: 900,
    });
    if (!limit.allowed) return <VerificationMessage limited />;
  }

  const resolved = await resolveApplicantVerification(token);
  if (!resolved) notFound();

  const auth = await getServerAuthState();
  if (auth.status === 'active') {
    if (auth.actor.applicantId === resolved.applicantId) redirect('/applicant/profile');

    const hasStaffRole = auth.actor.roles.some((role) =>
      ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'].includes(role),
    );
    if (hasStaffRole && auth.actor.permissions.has('applicant:read')) {
      try {
        await getApplicantForStaff(auth.actor, resolved.applicantId);
        const detailPath = auth.actor.roles.includes('SUPER_ADMIN')
          ? `/super-admin/applicants/${resolved.applicantId}`
          : auth.actor.roles.includes('BRANCH_ADMIN')
            ? `/branch-admin/applicants/${resolved.applicantId}`
            : `/staff/applicants/${resolved.applicantId}`;
        redirect(detailPath);
      } catch (error) {
        if (!(error instanceof ForbiddenError || error instanceof ScopeViolationError)) throw error;
      }
    }
  }

  const verification = resolved.verification;
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-5 px-6 py-12">
      <Image
        src="/logo.png"
        width={160}
        height={80}
        alt="Saylani"
        className="h-14 w-auto object-contain"
      />
      <section className="border-border bg-surface shadow-card grid gap-5 rounded-xl border p-6">
        <div className="grid gap-1">
          <p className="text-success text-sm font-medium">Registration Record Verified</p>
          <h1 className="text-fg text-2xl font-semibold">Saylani Job Bank</h1>
          <p className="text-fg-muted text-sm">Job seeker registration verification</p>
        </div>
        <dl className="border-border grid gap-3 border-y py-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-fg-muted">Registration reference</dt>
            <dd className="text-fg font-medium">{verification.registrationReference}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Registration date</dt>
            <dd className="text-fg font-medium">{formatDate(verification.registeredAt)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Applicant</dt>
            <dd className="text-fg font-medium">{verification.maskedApplicantName}</dd>
          </div>
          {verification.branchName && (
            <div>
              <dt className="text-fg-muted">Issuing branch</dt>
              <dd className="text-fg font-medium">{verification.branchName}</dd>
            </div>
          )}
        </dl>
        <p className="text-fg-muted text-xs leading-relaxed">
          This page confirms a registration record. It does not confirm the physical identity of the
          person presenting the document.
        </p>
      </section>
    </main>
  );
}

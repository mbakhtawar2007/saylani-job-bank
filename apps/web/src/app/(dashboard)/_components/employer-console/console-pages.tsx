import { JOB_STATUS_LABELS } from '@jobbank/shared';
import { Briefcase, Building2, PlusCircle, Users } from 'lucide-react';
import NextLink from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge, Button } from '@/components/atoms';
import { EmptyState } from '@/components/molecules';
import { requireRole } from '@/domains/auth';
import { actingForEmployer, listManagedEmployers } from '@/domains/company';
import { getMyJob, listMyJobs } from '@/domains/job';
import { getJobMatches, listRejectionReasons } from '@/domains/matching';
import { listReferrals } from '@/domains/placement';
import { DomainError, NotFoundError } from '@/domains/shared/errors';
import { JobDetailPanel } from '../../employer/jobs/_components/JobDetailPanel';
import { JobWizard } from '../../employer/jobs/_components/JobWizard';
import { MatchesShortlist } from '../../employer/jobs/_components/MatchesShortlist';
import { ReferralDetail } from '../../employer/referrals/_components/ReferralDetail';
import { ActingForEmployer } from './ActingForEmployer';

export type ConsoleRole = 'BRANCH_ADMIN';
type Params = Promise<{ companyId: string; id?: string }>;

const REFERRAL_LABELS: Record<string, string> = {
  FORWARDED: 'Referred',
  EMPLOYER_INTERVIEW_SCHEDULED: 'Interview scheduled',
  EMPLOYER_INTERVIEW_POSTPONED: 'Interview postponed',
  EMPLOYER_INTERVIEW_CANCELLED: 'Interview cancelled',
  ON_HOLD: 'On hold',
  OFFER_EXTENDED: 'Offer extended',
  EMPLOYER_REJECTED: 'Not selected',
  APPLICANT_REFUSED: 'Offer refused',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
};

async function acting(role: ConsoleRole, companyId: string) {
  const { actor } = await requireRole(role);
  try {
    return await actingForEmployer(actor, companyId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    if (e instanceof DomainError && e.status === 403) redirect('/forbidden');
    throw e;
  }
}

/** The employer's screen, wrapped so that it acts for the company; a job from elsewhere is a 404. */
async function shell(
  role: ConsoleRole,
  basePath: string,
  params: Params,
  body: (
    ctx: Awaited<ReturnType<typeof acting>>,
    consoleHref: string,
    id?: string,
  ) => Promise<ReactNode>,
) {
  const { companyId, id } = await params;
  const ctx = await acting(role, companyId);
  const consoleHref = `${basePath}/employers/${companyId}`;
  let content: ReactNode;
  try {
    content = await body(ctx, consoleHref, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return (
    <ActingForEmployer
      companyId={companyId}
      companyName={ctx.companyName}
      consoleHref={consoleHref}
    >
      {content}
    </ActingForEmployer>
  );
}

export async function EmployerListPage({
  role,
  basePath,
}: {
  role: ConsoleRole;
  basePath: string;
}) {
  const { actor } = await requireRole(role);
  const employers = await listManagedEmployers(actor);
  return (
    <div className="grid w-full gap-6">
      <header className="grid gap-1">
        <h1 className="text-fg text-2xl font-semibold">Employers</h1>
        <p className="text-fg-muted text-sm">
          Verified companies in your city. Open one to post jobs and record decisions for an
          employer who cannot use the system themselves.
        </p>
      </header>
      {employers.length === 0 ? (
        <EmptyState icon={Building2} title="No verified companies yet" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {employers.map((e) => (
            <li key={e.id}>
              <NextLink
                href={`${basePath}/employers/${e.id}`}
                className="border-border bg-surface hover:border-primary grid gap-0.5 rounded-xl border p-4"
              >
                <span className="text-fg font-semibold">{e.name}</span>
                {e.name !== e.legalName && (
                  <span className="text-fg-muted text-sm">{e.legalName}</span>
                )}
              </NextLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EmployerConsolePage(props: {
  role: ConsoleRole;
  basePath: string;
  params: Params;
}) {
  return shell(
    props.role,
    props.basePath,
    props.params,
    async ({ actor, companyName }, consoleHref) => {
      const [jobs, referrals] = await Promise.all([listMyJobs(actor), listReferrals(actor)]);
      return (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-fg text-2xl font-semibold">{companyName}</h1>
            <Button asChild leftIcon={<PlusCircle />}>
              <NextLink href={`${consoleHref}/jobs/new`}>Post a job</NextLink>
            </Button>
          </header>
          <section className="grid gap-3">
            <h2 className="text-fg text-base font-semibold">Referred candidates</h2>
            {referrals.length === 0 ? (
              <EmptyState icon={Users} compact title="No referred candidates yet" />
            ) : (
              <ul className="grid gap-2">
                {referrals.map((r) => (
                  <li key={r.id}>
                    <NextLink
                      href={`${consoleHref}/referrals/${r.id}`}
                      className="border-border bg-surface hover:border-primary flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4"
                    >
                      <span className="text-fg font-medium">{r.jobTitle}</span>
                      <Badge tone="neutral">{REFERRAL_LABELS[r.status] ?? r.status}</Badge>
                    </NextLink>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="grid gap-3">
            <h2 className="text-fg text-base font-semibold">Jobs</h2>
            {jobs.length === 0 ? (
              <EmptyState icon={Briefcase} compact title="No jobs yet" />
            ) : (
              <ul className="grid gap-2">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <NextLink
                      href={`${consoleHref}/jobs/${j.id}`}
                      className="border-border bg-surface hover:border-primary flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4"
                    >
                      <span className="text-fg font-medium">{j.title}</span>
                      <Badge tone="neutral">{JOB_STATUS_LABELS[j.status]}</Badge>
                    </NextLink>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      );
    },
  );
}

export function ConsoleNewJobPage(props: { role: ConsoleRole; basePath: string; params: Params }) {
  return shell(props.role, props.basePath, props.params, async (_ctx, consoleHref) => (
    <JobWizard basePath={consoleHref} />
  ));
}

export function ConsoleJobPage(props: { role: ConsoleRole; basePath: string; params: Params }) {
  return shell(props.role, props.basePath, props.params, async ({ actor }, consoleHref, id) => (
    <JobDetailPanel job={await getMyJob(actor, id!)} basePath={consoleHref} />
  ));
}

export function ConsoleEditJobPage(props: { role: ConsoleRole; basePath: string; params: Params }) {
  return shell(props.role, props.basePath, props.params, async ({ actor }, consoleHref, id) => {
    const job = await getMyJob(actor, id!);
    // 2026-11-12: the company may fully edit its own job in any editable
    // status — the old published-job field restrictions were lifted, so the
    // console edit screen no longer disables fields either.
    return <JobWizard initialJob={job} basePath={consoleHref} />;
  });
}

const PAGE_SIZE = 20;

export function ConsoleMatchesPage(props: {
  role: ConsoleRole;
  basePath: string;
  params: Params;
  searchParams: Promise<{ page?: string }>;
}) {
  return shell(props.role, props.basePath, props.params, async ({ actor }, _href, id) => {
    const { page: raw } = await props.searchParams;
    const page = Math.max(1, Number.parseInt(raw ?? '1', 10) || 1);
    const [job, matches, reasons] = await Promise.all([
      getMyJob(actor, id!),
      getJobMatches(actor, id!, { page, pageSize: PAGE_SIZE }),
      listRejectionReasons(),
    ]);
    return (
      <MatchesShortlist
        jobId={job.id}
        matches={matches}
        page={page}
        pageSize={PAGE_SIZE}
        reasons={reasons}
      />
    );
  });
}

export function ConsoleReferralPage(props: {
  role: ConsoleRole;
  basePath: string;
  params: Params;
}) {
  return shell(props.role, props.basePath, props.params, async ({ actor }, _href, id) => (
    <ReferralDetail actor={actor} id={id!} />
  ));
}

import { Briefcase, MapPin, Star, TrendingUp, CheckCircle2, Clock, Banknote } from 'lucide-react';
import NextLink from 'next/link';
import { Button } from '@/components/atoms';
import { getMyProfile } from '@/domains/applicant';
import { requireRole } from '@/domains/auth';
import { listReferredJobsForApplicant, type ReferredJobView } from '@/domains/job';
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS, SHIFT_TYPE_LABELS } from '@jobbank/shared';

export const metadata = { title: 'Referred Jobs — Saylani Job Bank' };

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return 'Salary not disclosed';
  const fmt = (n: number) =>
    n >= 1000 ? `PKR ${Math.round(n / 1000)}k` : `PKR ${n.toLocaleString()}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (max) return `Up to ${fmt(max)}`;
  return `From ${fmt(min!)}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function JobCard({ job }: { job: ReferredJobView }) {
  return (
    <div
      className="group rounded-2xl border p-5 transition-all duration-150 hover:shadow-md"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-fg truncate text-base font-bold">{job.title}</h3>
        {job.status !== 'OPEN' && (
          <span
            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: 'var(--neutral-soft)', color: 'var(--fg-muted)' }}
          >
            {JOB_STATUS_LABELS[job.status]}
          </span>
        )}
      </div>

      {/* Referred line */}
      <div className="mb-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
        <CheckCircle2 className="size-3.5 shrink-0" style={{ color: 'var(--primary)' }} />
        <span>Referred to you {timeAgo(job.referredAt)}</span>
      </div>

      {/* Tags row */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ background: 'var(--surface-muted)', color: 'var(--fg-muted)' }}
        >
          {JOB_TYPE_LABELS[job.jobType as keyof typeof JOB_TYPE_LABELS] ?? job.jobType}
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ background: 'var(--surface-muted)', color: 'var(--fg-muted)' }}
        >
          {SHIFT_TYPE_LABELS[job.shift as keyof typeof SHIFT_TYPE_LABELS] ?? job.shift}
        </span>
      </div>

      {/* Referral note */}
      {job.referralNote && (
        <p className="text-fg-muted mb-3 text-xs leading-relaxed">“{job.referralNote}”</p>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between gap-3 border-t pt-3 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}
      >
        <div className="flex items-center gap-1">
          <Banknote className="size-3.5" />
          <span>{formatSalary(job.salaryMin, job.salaryMax)}</span>
        </div>
        {job.publishedAt && (
          <div className="flex items-center gap-1">
            <Clock className="size-3.5" />
            <span>{timeAgo(job.publishedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default async function ApplicantJobsPage() {
  const { actor } = await requireRole('APPLICANT');
  const profile = await getMyProfile(actor);

  /* ── No profile ──────────────────────────────────────────────── */
  if (!profile) {
    return (
      <div className="grid w-full gap-6">
        <header>
          <h1 className="text-fg text-2xl font-bold">Referred Jobs</h1>
        </header>
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-fg-muted mb-4 text-sm">
            Create your profile first so staff can refer jobs to you.
          </p>
          <Button asChild>
            <NextLink href="/applicant/profile">Start my profile</NextLink>
          </Button>
        </div>
      </div>
    );
  }

  /* ── Profile incomplete / no location ────────────────────────── */
  if (!profile.address) {
    return (
      <div className="grid w-full gap-6">
        <header>
          <h1 className="text-fg text-2xl font-bold">Referred Jobs</h1>
        </header>
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <MapPin className="mx-auto mb-3 size-10" style={{ color: 'var(--primary)' }} />
          <p className="text-fg mb-1 font-semibold">Add your home location</p>
          <p className="text-fg-muted mb-4 text-sm">We need your city to find jobs near you.</p>
          <Button asChild variant="secondary">
            <NextLink href="/applicant/profile?step=location">Add location</NextLink>
          </Button>
        </div>
      </div>
    );
  }

  const jobs = await listReferredJobsForApplicant(actor);

  return (
    <div className="grid w-full gap-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-fg text-2xl font-bold sm:text-3xl">Referred Jobs</h1>
          <p className="text-fg-muted text-sm">
            Jobs in <strong>{profile.address.cityCode}</strong> that Job Bank staff referred to you
          </p>
        </div>
        {jobs.length > 0 && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
            <span style={{ color: 'var(--fg-muted)' }}>
              {jobs.length} referred {jobs.length === 1 ? 'job' : 'jobs'}
            </span>
          </div>
        )}
      </div>

      {/* ── Profile incomplete warning ────────────────────────────── */}
      {profile.status === 'DRAFT' && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--warning-soft)', color: 'var(--warning-soft-fg)' }}
        >
          Your profile is incomplete — complete it so staff can refer you to more jobs and so you
          appear in the Job Bank staff queue.{' '}
          <NextLink
            href="/applicant/profile"
            className="font-semibold underline underline-offset-4"
          >
            Complete profile
          </NextLink>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {jobs.length === 0 && (
        <div
          className="rounded-2xl border p-10 text-center"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div
            className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl"
            style={{ background: 'var(--primary-soft)' }}
          >
            <Briefcase className="size-7" style={{ color: 'var(--primary)' }} />
          </div>
          <h2 className="text-fg mb-2 text-lg font-bold">No jobs referred to you yet</h2>
          <p className="text-fg-muted text-sm leading-relaxed">
            We&apos;ll show jobs here when Job Bank staff in{' '}
            <strong>{profile.address.cityCode}</strong> refer one to you. Check back soon!
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3 text-left">
            {[
              {
                icon: Star,
                label: 'Complete your profile',
                desc: 'More details = more referrals when jobs appear',
                color: '#b45309',
              },
              {
                icon: TrendingUp,
                label: 'Add your skills',
                desc: "Employers see who's available for their specific roles",
                color: '#1a5fac',
              },
              {
                icon: MapPin,
                label: 'Set job preferences',
                desc: 'Tell us what type of work you want',
                color: '#0d7a3e',
              },
            ].map((tip) => {
              const Icon = tip.icon;
              return (
                <div
                  key={tip.label}
                  className="rounded-xl p-3"
                  style={{ background: 'var(--surface-muted)' }}
                >
                  <Icon className="mb-2 size-5" style={{ color: tip.color }} />
                  <p className="text-fg text-sm font-semibold">{tip.label}</p>
                  <p className="text-fg-muted mt-0.5 text-xs">{tip.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Job grid ─────────────────────────────────────────────── */}
      {jobs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

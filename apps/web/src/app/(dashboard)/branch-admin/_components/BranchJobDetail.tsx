import {
  GENDER_PREFERENCE_LABELS,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  SHIFT_TYPE_LABELS,
  type JobStatus,
} from '@jobbank/shared';
import { Badge } from '@/components/atoms';
import type { JobView } from '@/domains/job';
import NextLink from 'next/link';

const STATUS_BADGE: Record<JobStatus, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  DRAFT: 'neutral',
  OPEN: 'success',
  PAUSED: 'warning',
  FILLED: 'success',
  CLOSED: 'neutral',
  EXPIRED: 'danger',
};

function KV({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-fg-subtle text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-fg text-sm break-words">{value ?? '—'}</dd>
    </div>
  );
}

export function BranchJobDetail({
  job,
  company,
  categoryLabel,
}: {
  job: JobView;
  company?: { id: string; name: string };
  categoryLabel?: string;
}) {
  return (
    <div className="grid w-full gap-6">
      {company && (
        <NextLink
          href={`/branch-admin/companies/${company.id}`}
          className="text-fg-muted w-fit text-sm hover:underline"
        >
          Back to {company.name}
        </NextLink>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-fg text-2xl font-semibold">{job.title}</h1>
          <p className="text-fg-muted mt-1 text-sm">{categoryLabel ?? job.categoryCode}</p>
        </div>
        <Badge tone={STATUS_BADGE[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
      </header>
      <section className="border-border bg-surface grid gap-4 rounded-xl border p-5">
        <h2 className="text-fg font-medium">Job details</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {company && <KV label="Company" value={company.name} />}
          <KV label="Category" value={categoryLabel ?? job.categoryCode} />
          <KV label="Type" value={JOB_TYPE_LABELS[job.jobType]} />
          <KV label="Shift" value={SHIFT_TYPE_LABELS[job.shift]} />
          <KV label="Gender" value={GENDER_PREFERENCE_LABELS[job.genderPreference]} />
          <KV label="Total vacancies" value={job.vacancies} />
          <KV label="Filled vacancies" value={job.vacanciesFilled} />
          {(job.salaryMin != null || job.salaryMax != null) && (
            <KV
              label="Salary (PKR/mo)"
              value={[job.salaryMin, job.salaryMax].filter((v) => v != null).join(' – ')}
            />
          )}
          {job.closesAt && <KV label="Closes" value={job.closesAt.slice(0, 10)} />}
          {job.publishedAt && <KV label="Published" value={job.publishedAt.slice(0, 10)} />}
        </dl>
      </section>
      <section className="border-border bg-surface rounded-xl border p-5">
        <h2 className="text-fg mb-3 font-medium">Description</h2>
        <p className="text-fg-muted text-sm whitespace-pre-wrap">{job.description}</p>
      </section>
      {job.locations.length > 0 && (
        <section className="border-border bg-surface grid gap-3 rounded-xl border p-5">
          <h2 className="text-fg font-medium">Locations</h2>
          {job.locations.map((location) => (
            <p key={location.id} className="text-fg-muted text-sm">
              {location.addressLine}, {location.cityCode}
            </p>
          ))}
        </section>
      )}
      {job.requirements && (
        <section className="border-border bg-surface grid gap-3 rounded-xl border p-5">
          <h2 className="text-fg font-medium">Requirements</h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {job.requirements.educationLevelCode && (
              <KV label="Education" value={job.requirements.educationLevelCode} />
            )}
            {job.requirements.minExperienceYears != null && (
              <KV label="Minimum experience (years)" value={job.requirements.minExperienceYears} />
            )}
            {job.requirements.languageCodes.length > 0 && (
              <KV label="Languages" value={job.requirements.languageCodes.join(', ')} />
            )}
            {job.requirements.otherRequirements && (
              <KV label="Other requirements" value={job.requirements.otherRequirements} />
            )}
          </dl>
        </section>
      )}
      {job.skills.length > 0 && (
        <section className="border-border bg-surface grid gap-3 rounded-xl border p-5">
          <h2 className="text-fg font-medium">Skills</h2>
          {job.skills.map((skill) => (
            <p key={skill.skillCode} className="text-fg-muted text-sm">
              {skill.skillCode} · {skill.minLevel} · {skill.required ? 'Required' : 'Preferred'}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

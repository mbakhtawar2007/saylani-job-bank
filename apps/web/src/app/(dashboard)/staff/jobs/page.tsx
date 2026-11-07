import { JobListPage } from '../../_components/jobs/job-pages';

export const metadata = { title: 'Jobs' };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <JobListPage
      role="STAFF"
      basePath="/staff/jobs"
      subtitle="in your branch"
      searchParams={searchParams}
    />
  );
}

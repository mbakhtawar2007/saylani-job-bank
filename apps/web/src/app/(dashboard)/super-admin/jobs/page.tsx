import { JobListPage } from '../../_components/jobs/job-pages';

export const metadata = { title: 'Jobs' };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <JobListPage
      role="SUPER_ADMIN"
      basePath="/super-admin/jobs"
      subtitle="total"
      searchParams={searchParams}
    />
  );
}

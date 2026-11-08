import { JobListPage } from '../../_components/jobs/job-pages';

export const metadata = { title: 'Jobs' };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <JobListPage
      role="VERIFIER"
      basePath="/verifier/jobs"
      subtitle="in your city"
      postJobHref="/verifier/jobs/new"
      searchParams={searchParams}
    />
  );
}

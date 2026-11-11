import { ConsoleMatchesPage } from '../../../../../../_components/employer-console/console-pages';

export const metadata = { title: 'Shortlist' };

export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; id?: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <ConsoleMatchesPage
      role="BRANCH_ADMIN"
      basePath="/branch-admin"
      params={params}
      searchParams={searchParams}
    />
  );
}

import { ConsoleEditJobPage } from '../../../../../../_components/employer-console/console-pages';

export const metadata = { title: 'Edit job' };

export default function Page({ params }: { params: Promise<{ companyId: string; id?: string }> }) {
  return <ConsoleEditJobPage role="BRANCH_ADMIN" basePath="/branch-admin" params={params} />;
}

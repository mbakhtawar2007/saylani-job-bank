import { ConsoleNewJobPage } from '../../../../../_components/employer-console/console-pages';

export const metadata = { title: 'Post a job' };

export default function Page({ params }: { params: Promise<{ companyId: string; id?: string }> }) {
  return <ConsoleNewJobPage role="STAFF" basePath="/staff" params={params} />;
}

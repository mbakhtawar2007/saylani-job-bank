import { ConsoleJobPage } from '../../../../../_components/employer-console/console-pages';

export const metadata = { title: 'Job' };

export default function Page({ params }: { params: Promise<{ companyId: string; id?: string }> }) {
  return <ConsoleJobPage role="STAFF" basePath="/staff" params={params} />;
}

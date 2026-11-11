import { EmployerConsolePage } from '../../../_components/employer-console/console-pages';

export const metadata = { title: 'Employer' };

export default function Page({ params }: { params: Promise<{ companyId: string; id?: string }> }) {
  return <EmployerConsolePage role="STAFF" basePath="/staff" params={params} />;
}

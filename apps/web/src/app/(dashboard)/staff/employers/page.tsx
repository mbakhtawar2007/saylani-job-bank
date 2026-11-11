import { EmployerListPage } from '../../_components/employer-console/console-pages';

export const metadata = { title: 'Employers' };

export default function Page() {
  return <EmployerListPage role="STAFF" basePath="/staff" />;
}

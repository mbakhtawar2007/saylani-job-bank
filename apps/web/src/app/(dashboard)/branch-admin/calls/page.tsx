import { CallListPage } from '../../_components/counter/counter-pages';

export const metadata = { title: 'Call list' };

export default function Page() {
  return <CallListPage role="BRANCH_ADMIN" basePath="/branch-admin" />;
}

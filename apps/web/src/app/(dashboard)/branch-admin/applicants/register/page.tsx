import { CounterRegisterPage } from '../../../_components/counter/counter-pages';

export const metadata = { title: 'Register a candidate' };

export default function Page() {
  return <CounterRegisterPage role="BRANCH_ADMIN" basePath="/branch-admin/applicants" />;
}

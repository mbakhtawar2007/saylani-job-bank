import { TokenRegistrationPage } from '../../../_components/applicants/applicant-pages';

export const metadata = { title: 'Register from token' };

export default function Page() {
  return <TokenRegistrationPage role="SUPER_ADMIN" basePath="/super-admin/applicants" />;
}

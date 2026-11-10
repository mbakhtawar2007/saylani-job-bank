import { ApplicantEditPage } from '../../../../_components/applicants/applicant-pages';

export const metadata = { title: 'Edit applicant profile' };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <ApplicantEditPage role="BRANCH_ADMIN" basePath="/branch-admin/applicants" params={params} />
  );
}

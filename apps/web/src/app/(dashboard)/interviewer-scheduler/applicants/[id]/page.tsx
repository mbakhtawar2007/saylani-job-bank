import { ApplicantDetailPage } from '../../../_components/applicants/applicant-pages';

export const metadata = { title: 'Applicant' };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <ApplicantDetailPage
      role="INTERVIEWER_SCHEDULER"
      basePath="/interviewer-scheduler/applicants"
      params={params}
    />
  );
}

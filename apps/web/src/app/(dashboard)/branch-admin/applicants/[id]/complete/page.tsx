import { CounterCompletePage } from '../../../../_components/counter/counter-pages';

export const metadata = { title: 'Complete candidate profile' };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <CounterCompletePage role="BRANCH_ADMIN" basePath="/branch-admin/applicants" params={params} />
  );
}

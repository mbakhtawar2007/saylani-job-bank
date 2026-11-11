import { ConsoleReferralPage } from '../../../../../_components/employer-console/console-pages';

export const metadata = { title: 'Referred candidate' };

export default function Page({ params }: { params: Promise<{ companyId: string; id?: string }> }) {
  return <ConsoleReferralPage role="STAFF" basePath="/staff" params={params} />;
}

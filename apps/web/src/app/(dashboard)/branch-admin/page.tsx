import { WelcomePanel } from '../_components/WelcomePanel';

export const metadata = { title: 'Branch Admin Dashboard — Saylani Job Bank' };

/** Live data on every load — dashboards are never statically cached. */
export const dynamic = 'force-dynamic';

export default function BranchAdminHomePage() {
  return <WelcomePanel role="BRANCH_ADMIN" />;
}

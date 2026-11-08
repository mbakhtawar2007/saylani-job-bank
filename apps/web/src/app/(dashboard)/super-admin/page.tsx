import { WelcomePanel } from '../_components/WelcomePanel';

export const metadata = { title: 'Super Admin — Saylani Job Bank' };

/** Live data on every load — dashboards are never statically cached. */
export const dynamic = 'force-dynamic';

export default function SuperAdminHomePage() {
  return <WelcomePanel role="SUPER_ADMIN" />;
}

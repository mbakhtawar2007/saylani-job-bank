import { WelcomePanel } from '../_components/WelcomePanel';

export const metadata = { title: 'Employer Dashboard — Saylani Job Bank' };

/** Live data on every load — dashboards are never statically cached. */
export const dynamic = 'force-dynamic';

export default function EmployerHomePage() {
  return <WelcomePanel role="EMPLOYER" />;
}

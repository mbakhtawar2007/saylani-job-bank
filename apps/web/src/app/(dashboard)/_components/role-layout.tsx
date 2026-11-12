import { ROLE_PRIORITY, type Role } from '@jobbank/shared';
import type { ReactNode } from 'react';
import { describeMe, requireRole, requireSignedIn } from '@/domains/auth';
import { listBranches } from '@/domains/branch';
import { RoleShell } from './RoleShell';

async function Shell({
  role,
  state,
  children,
}: {
  role: Role;
  state: Awaited<ReturnType<typeof requireSignedIn>>;
  children: ReactNode;
}) {
  const { user, actor } = state;
  const me = await describeMe(user, actor);
  const [switchable, branchOptions] = await Promise.all([
    role === 'SUPER_ADMIN' && !actor.twoFactorPending
      ? listBranches({ ...actor, activeBranchId: null }).then((branches) =>
          branches.map((b) => ({ id: b.id, name: b.name })),
        )
      : Promise.resolve(undefined),
    role === 'STAFF' || role === 'VERIFIER' ? listBranches(actor) : Promise.resolve(undefined),
  ]);
  // Sidebar "Issue Token" button (2026-11-12): Staff only. Super Admin
  // and Branch Admin no longer issue tokens — the server rejects them
  // in issueApplicantToken too.
  const registrationBranches =
    role === 'STAFF'
      ? // N10: inactive branches must not be offered — the server rejects
        // them, so listing them only produces a dead end in the dialog.
        branchOptions
          ?.filter((branch) => branch.isActive)
          .map((branch) => ({ value: branch.id, label: branch.name }))
      : undefined;
  // Sidebar "Company Registration" button (2026-11-12): Verifier only.
  // Super Admin and Branch Admin no longer register companies — the
  // server rejects them in staffOnboardCompany too. Staff never
  // registers companies.
  const companyRegistrationBranches =
    role === 'VERIFIER'
      ? branchOptions
          ?.filter((branch) => branch.isActive)
          .map((branch) => ({ value: branch.id, label: branch.name }))
      : undefined;
  // Employer Jobs nav: an employer with a company can always reach Jobs
  // (and Post a job) from the sidebar, even with zero jobs yet. No company
  // → hidden, as before.
  const hideEmployerJobs = role === 'EMPLOYER' ? !actor.companyId : false;
  return (
    <RoleShell
      role={role}
      user={{ name: user.name }}
      branchNames={me.branches.map((b) => b.name)}
      registrationBranches={registrationBranches}
      companyRegistrationBranches={companyRegistrationBranches}
      switchableBranches={switchable}
      activeBranchId={actor.activeBranchId}
      showSecurity={!actor.roles.every((r) => r === 'APPLICANT')}
      hideEmployerJobs={hideEmployerJobs}
    >
      {children}
    </RoleShell>
  );
}

/** Server layout for a role area: authoritative session + role (+ 2FA) check, then the shell. */
export async function RoleLayout({ role, children }: { role: Role; children: ReactNode }) {
  const state = await requireRole(role);
  return (
    <Shell role={role} state={state}>
      {children}
    </Shell>
  );
}

/** Layout for pages any signed-in user can open (account settings), shown in their main role's shell. */
export async function AccountLayout({ children }: { children: ReactNode }) {
  const state = await requireSignedIn({ allowTwoFactorPending: true });
  const role = ROLE_PRIORITY.find((r) => state.actor.roles.includes(r)) ?? 'APPLICANT';
  return (
    <Shell role={role} state={state}>
      {children}
    </Shell>
  );
}

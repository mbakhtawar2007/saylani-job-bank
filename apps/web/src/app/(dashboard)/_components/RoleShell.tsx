'use client';

import { ROLE_LABELS, type Role } from '@jobbank/shared';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { toast } from '@/components/molecules';
import { DashboardLayout } from '@/components/templates';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import type { SelectOption } from '@/components/atoms';
import { IssueApplicantTokenDialog } from './applicants/IssueApplicantTokenDialog';
import { RegisterCompanyDialog } from './companies/RegisterCompanyDialog';
import { navigationFor } from './navigation';
import { useSignOut } from './SignOutButton';

const ALL_BRANCHES = '__all__';

export interface RoleShellProps {
  role: Role;
  user: { name: string };
  /** Branch names shown in the sidebar footer. */
  branchNames: string[];
  /** Super Admin only: every branch, for the scope switcher. */
  switchableBranches?: { id: string; name: string }[];
  /** Branches this staff member may register applicants for. */
  registrationBranches?: SelectOption[];
  /** Active branches this role may register companies for. */
  companyRegistrationBranches?: SelectOption[];
  activeBranchId?: string | null;
  /** Applicants have no password/2FA settings. */
  showSecurity?: boolean;
  /** Employer with no own job postings: hide the Jobs nav item. */
  hideEmployerJobs?: boolean;
  children: ReactNode;
}

export function RoleShell({
  role,
  user,
  branchNames,
  switchableBranches,
  registrationBranches,
  companyRegistrationBranches,
  activeBranchId,
  showSecurity = true,
  hideEmployerJobs = false,
  children,
}: RoleShellProps) {
  const router = useRouter();
  const signOut = useSignOut();

  const switchBranch = async (value: string) => {
    try {
      await apiFetch('/api/v1/auth/scope', {
        method: 'PUT',
        body: { branchId: value === ALL_BRANCHES ? null : value },
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not switch branch');
    }
  };

  return (
    <DashboardLayout
      navigation={navigationFor(role, { hideEmployerJobs })}
      sidebarAction={
        registrationBranches || companyRegistrationBranches ? (
          <div className="grid gap-2">
            {registrationBranches && (
              // Token-only first counter (2026-11-07 reversal): the sidebar
              // issues a numbered token from a CNIC + name. The full
              // RegisterApplicantDialog is kept for the later step.
              <IssueApplicantTokenDialog branches={registrationBranches} placement="sidebar" />
            )}
            {companyRegistrationBranches && (
              <RegisterCompanyDialog branches={companyRegistrationBranches} placement="sidebar" />
            )}
          </div>
        ) : undefined
      }
      sidebarFooter={
        <div
          className="mx-1 rounded-xl p-3"
          style={{
            background: 'linear-gradient(135deg, #0d7a3e 0%, #16a050 100%)',
          }}
        >
          <p className="mb-0.5 truncate text-xs font-bold" style={{ color: '#fff' }}>
            {switchableBranches
              ? 'All branches (oversight)'
              : branchNames.join(' · ') || ROLE_LABELS[role]}
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {ROLE_LABELS[role]} · Saylani Job Bank
          </p>
        </div>
      }
      topBar={{
        user: { name: user.name, role: ROLE_LABELS[role] },
        notificationsHref: role === 'APPLICANT' ? '/applicant/notifications' : '/notifications',
        userMenuItems: [
          ...(showSecurity
            ? [
                {
                  label: 'Security',
                  icon: ShieldCheck,
                  onSelect: () => router.push('/account/security'),
                },
              ]
            : []),
          {
            label: 'Sign out',
            icon: LogOut,
            tone: 'danger' as const,
            onSelect: () => void signOut(),
          },
        ],
        branchSwitcher: switchableBranches
          ? {
              branches: [{ id: ALL_BRANCHES, name: 'All branches' }, ...switchableBranches],
              value: activeBranchId ?? ALL_BRANCHES,
              onChange: (id) => void switchBranch(id),
            }
          : undefined,
      }}
    >
      {children}
    </DashboardLayout>
  );
}

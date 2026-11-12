import type { ReactNode } from 'react';
import { RoleLayout } from '../_components/role-layout';

export default function InterviewerSchedulerLayout({ children }: { children: ReactNode }) {
  return <RoleLayout role="INTERVIEWER_SCHEDULER">{children}</RoleLayout>;
}

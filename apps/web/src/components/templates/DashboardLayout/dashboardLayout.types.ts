import type { ReactNode } from 'react';
import type { NavSection } from '@/components/organisms/AppSidebar';
import type { TopBarProps } from '@/components/organisms/TopBar';

export interface DashboardLayoutProps {
  navigation: NavSection[];
  topBar?: Omit<TopBarProps, 'onMenuClick'>;
  children: ReactNode;
  /** Optional primary action shown in the sidebar below navigation. */
  sidebarAction?: ReactNode;
  /** Shown at the bottom of the sidebar, e.g. the branch name or app version. */
  sidebarFooter?: ReactNode;
}

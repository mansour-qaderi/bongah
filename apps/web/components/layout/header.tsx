'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { SidebarIcon } from '@/components/ui/sidebar-icon';
import { PlanBadge } from './plan-badge';
import { titleKeyFor } from './nav';
import { useT } from '@/i18n/provider';

const ICON_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink-2 transition-colors hover:bg-soft hover:text-primary';

/**
 * The top bar. At its start (the right edge, next to the sidebar) sits the sidebar control and the page title; at its
 * end the plan badge, and nothing else: creating a listing lives in the sidebar, not up here. The signed-in person (name, phone, log out) is no longer here: it is the footer of
 * the sidebar. The control opens the drawer on a narrow screen and collapses or expands the sidebar from the lg
 * breakpoint up; it carries no visible text, only its accessible name.
 */
export function Header({
  collapsed,
  onToggleCollapsed,
  onOpenMenu,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const t = useT();

  return (
    <header className="z-20 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:gap-3 sm:px-6">
      {/* Narrow screens: opens the drawer. */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={t('header.openMenu')}
        aria-controls="app-sidebar"
        className={cn(ICON_BUTTON, 'lg:hidden')}
        data-testid="sidebar-open"
      >
        <SidebarIcon className="h-[22px] w-[22px]" />
      </button>
      {/* From lg up: collapses and expands the sidebar. */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? t('header.openMenu') : t('header.collapseMenu')}
        aria-controls="app-sidebar"
        aria-expanded={!collapsed}
        className={cn(ICON_BUTTON, 'max-lg:hidden')}
        data-testid="sidebar-toggle"
      >
        <SidebarIcon className="h-[22px] w-[22px]" />
      </button>

      <span aria-hidden className="h-6 w-px bg-line" />

      <h1 className="min-w-0 truncate text-[15px] font-bold text-ink">{t(titleKeyFor(pathname))}</h1>

      <div className="ms-auto flex items-center gap-2 sm:gap-3">
        <div className="hidden md:block">
          <PlanBadge />
        </div>
      </div>
    </header>
  );
}

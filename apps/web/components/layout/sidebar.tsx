'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { LogoLockup } from '@/components/ui/logo';
import { Tip } from '@/components/ui/tooltip';
import { AccountMenu } from './account-menu';
import { isActive, navItemsFor } from './nav';
import { useT } from '@/i18n/provider';
import { useMe } from '@/hooks/use-api';

/**
 * The right-hand navigation. Expanded it is 256px wide; collapsed it is a 72px rail of icons with tooltips. Below the
 * lg breakpoint it is an off-canvas drawer. Both are controlled from the header (the sidebar icon there); the sidebar
 * itself has no collapse button.
 *
 * Layout: a column that is exactly as tall as the app frame (`lg:h-full`, the frame is one viewport) and never scrolls
 * as a whole: logo on top, the links in the middle (`min-h-0 flex-1`, the only part that may scroll, and only when the
 * links really do not fit), the signed-in person pinned at the bottom. Without `min-h-0` a flex child will not shrink
 * below its content, which is how a scrollbar used to appear beside the sidebar while the page was still loading.
 */
export function Sidebar({ collapsed, mobileOpen, onNavigate }: { collapsed: boolean; mobileOpen: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const { data: me } = useMe();
  const items = navItemsFor(me?.role);

  return (
    <>
      {mobileOpen ? <div className="fixed inset-0 z-30 bg-black/45 lg:hidden" onClick={onNavigate} aria-hidden /> : null}
      <aside
        id="app-sidebar"
        aria-label={t('nav.main')}
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex flex-col overflow-hidden border-e border-line bg-surface transition-[width,transform] duration-200',
          'w-64 lg:static lg:h-full lg:translate-x-0 lg:shrink-0',
          collapsed ? 'lg:w-[72px]' : 'lg:w-64',
          mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className={cn('flex h-16 shrink-0 items-center border-b border-line px-4', collapsed && 'lg:justify-center lg:px-0')}>
          <LogoLockup collapsed={collapsed} className={cn(collapsed && 'max-lg:flex')} />
        </div>

        <nav className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3">
          {items.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            const label = t(item.labelKey);
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  collapsed && 'lg:justify-center lg:px-0',
                  active ? 'bg-primary text-white' : 'text-ink-2 hover:bg-soft',
                )}
              >
                <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.9} />
                <span className={cn('truncate', collapsed && 'lg:sr-only')}>{label}</span>
              </Link>
            );
            return collapsed ? (
              <Tip key={item.href} label={label} side="left">
                {link}
              </Tip>
            ) : (
              link
            );
          })}
        </nav>

        <AccountMenu collapsed={collapsed} />
      </aside>
    </>
  );
}

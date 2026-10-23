'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LogoLockup } from '@/components/ui/logo';
import { Tip } from '@/components/ui/tooltip';
import { isActive, NAV_ITEMS } from './nav';

/**
 * The right-hand navigation. Expanded it is 256px wide; collapsed it is a 72px rail of icons with tooltips. Below the
 * lg breakpoint it is an off-canvas drawer opened from the header (`mobileOpen`).
 */
export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-black/45 lg:hidden" onClick={onNavigate} aria-hidden />
      ) : null}
      <aside
        aria-label="منوی اصلی"
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex flex-col border-e border-line bg-surface transition-[width,transform] duration-200',
          'w-64 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:shrink-0',
          collapsed ? 'lg:w-[72px]' : 'lg:w-64',
          mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className={cn('flex h-16 items-center border-b border-line px-4', collapsed && 'lg:justify-center lg:px-0')}>
          <LogoLockup collapsed={collapsed} className={cn(collapsed && 'max-lg:flex')} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
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
                <span className={cn('truncate', collapsed && 'lg:sr-only')}>{item.label}</span>
              </Link>
            );
            return collapsed ? (
              <Tip key={item.href} label={item.label} side="left">
                {link}
              </Tip>
            ) : (
              link
            );
          })}
        </nav>

        <div className="hidden border-t border-line p-3 lg:block">
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'باز کردن منو' : 'جمع کردن منو'}
            aria-expanded={!collapsed}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-soft',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <ChevronsLeft className="h-[18px] w-[18px]" /> : <ChevronsRight className="h-[18px] w-[18px]" />}
            {collapsed ? null : <span>جمع کردن منو</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

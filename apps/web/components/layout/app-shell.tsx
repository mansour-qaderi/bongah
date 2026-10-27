'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { AgencyGate } from './agency-gate';
import { NameGuard } from './name-guard';
import { PaymentWatcher } from './payment-watcher';

/**
 * The signed-in frame: sidebar on the right (RTL), header on top, the page below.
 *
 * The frame is exactly one viewport tall and never scrolls itself; only `<main>` does. Before, the whole document
 * scrolled whenever a page (the loading skeletons especially) was taller than the window, and the browser drew that
 * page scrollbar flush against the sidebar, where it read as a scrollbar of the sidebar. Now the sidebar and the
 * header stay put and the scrollbar belongs to the content, at its own edge. `min-h-0` on the flex children is what
 * lets `<main>` shrink to the viewport instead of growing to its content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useLocalStorage<boolean>('bongah.sidebar.collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer after navigating, and on Escape.
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <TooltipProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Header collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} onOpenMenu={() => setMobileOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
            <AgencyGate>{children}</AgencyGate>
          </main>
        </div>
      </div>
      <PaymentWatcher />
      <NameGuard />
    </TooltipProvider>
  );
}

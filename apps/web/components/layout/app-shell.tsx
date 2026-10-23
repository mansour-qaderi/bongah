'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { AgencyGate } from './agency-gate';

/** The signed-in frame: sidebar on the right (RTL), header on top, the page below. */
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
      <div className="flex min-h-dvh">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onNavigate={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onOpenMenu={() => setMobileOpen(true)} />
          <main className="flex-1 px-4 py-6 sm:px-6">
            <AgencyGate>{children}</AgencyGate>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

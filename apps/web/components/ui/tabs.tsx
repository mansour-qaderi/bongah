'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Radix tabs default to `dir="ltr"` whatever the page says, which put the first tab on the left of a right-to-left
 * panel («همه» last). The panel is always RTL, so the tabs say so: the first tab is the rightmost.
 */
export function Tabs(props: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root dir="rtl" {...props} />;
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List className={cn('inline-flex items-center gap-1 rounded-xl bg-soft p-1', className)}>
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ value, children, count }: { value: string; children: ReactNode; count?: number | string }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors',
        'hover:text-primary data-[state=active]:bg-surface data-[state=active]:text-primary data-[state=active]:ring-1 data-[state=active]:ring-line',
      )}
    >
      {children}
      {count !== undefined ? <span className="rounded-full bg-line px-1.5 text-[11px] text-muted">{count}</span> : null}
    </TabsPrimitive.Trigger>
  );
}

export const TabsContent = TabsPrimitive.Content;

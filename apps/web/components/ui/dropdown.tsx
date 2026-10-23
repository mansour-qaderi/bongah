'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function DropdownRoot(props: React.ComponentProps<typeof Menu.Root>) {
  return <Menu.Root dir="rtl" {...props} />;
}
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({ children, className, align = 'end' }: { children: ReactNode; className?: string; align?: 'start' | 'end' }) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-48 rounded-xl border border-line bg-surface p-1.5 text-sm', className)}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  disabled,
  icon,
}: {
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Menu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-soft',
        danger ? 'text-danger' : 'text-ink-2',
      )}
    >
      {icon}
      {children}
    </Menu.Item>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className="px-3 py-1.5 text-xs text-muted">{children}</Menu.Label>;
}

export function DropdownSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}

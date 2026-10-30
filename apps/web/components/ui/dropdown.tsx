'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function DropdownRoot(props: React.ComponentProps<typeof Menu.Root>) {
  return <Menu.Root dir="rtl" {...props} />;
}
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({
  children,
  className,
  align = 'end',
  side = 'bottom',
}: {
  children: ReactNode;
  className?: string;
  align?: 'start' | 'end';
  /** Which side of the trigger the menu opens on; `top` for a trigger at the bottom of the screen. */
  side?: 'top' | 'bottom';
}) {
  return (
    <Menu.Portal>
      <Menu.Content
        side={side}
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

/** An item with a tick that toggles without closing the menu, for choosing several things from one list. */
export function DropdownCheckItem({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Menu.CheckboxItem
      checked={checked}
      onCheckedChange={onChange}
      onSelect={(event) => event.preventDefault()}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-ink-2 outline-none data-[highlighted]:bg-soft"
    >
      <span
        aria-hidden
        className={cn(
          'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border text-[11px] font-bold leading-none transition-colors',
          checked ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface text-transparent',
        )}
      >
        ✓
      </span>
      {children}
    </Menu.CheckboxItem>
  );
}

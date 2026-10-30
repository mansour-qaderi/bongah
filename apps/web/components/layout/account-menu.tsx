'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Wallet as WalletIcon } from 'lucide-react';
import { mutate } from 'swr';
import { toast } from 'sonner';
import { authPost } from '@/lib/api';
import { tNow } from '@/i18n/active';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatPhone } from '@/lib/format';
import { useMe } from '@/hooks/use-api';
import { useActiveMarket } from '@/hooks/use-active-market';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { Skeleton } from '@/components/ui/skeleton';
import { Tip } from '@/components/ui/tooltip';
import { PlanBadge } from './plan-badge';

/** The round picture of the signed-in person: their photo when it loads, otherwise the first letter of their name. */
function Avatar({ name, src, fallback }: { name: string; src?: string | null; fallback: string }) {
  // A photo address that does not load (deleted, blocked, offline) must not leave a broken-image icon behind.
  const [failed, setFailed] = useState<string | null>(null);
  const initial = Array.from(name.trim())[0] ?? fallback;
  const showPhoto = Boolean(src) && failed !== src;
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-tint text-[15px] font-bold text-primary"
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small avatar from any host the user's profile names
        <img src={src!} alt="" className="h-full w-full object-cover" onError={() => setFailed(src ?? null)} />
      ) : (
        initial
      )}
    </span>
  );
}

/**
 * The signed-in person, as the footer of the sidebar: photo, name and phone, and the menu with the plan and "log out".
 * In the collapsed rail only the photo shows. The sidebar is a column that never scrolls as a whole, so this always
 * stays at the bottom of the screen.
 */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const t = useT();
  const { data: me } = useMe();
  const market = useActiveMarket();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    try {
      await authPost('logout');
    } catch {
      /* the cookie is cleared by the next 401 anyway */
    }
    await mutate(() => true, undefined, { revalidate: false }); // forget everything cached for this account
    toast.success(tNow('account.loggedOut'));
    router.replace('/login');
    router.refresh();
  }

  const name = me?.full_name?.trim() || '';
  const shownName = name || t('account.fallbackName');

  const trigger = (
    <DropdownTrigger asChild>
      <button
        type="button"
        aria-label={t('account.menuLabel', { name: shownName })}
        data-testid="account-menu"
        className={cn(
          'flex w-full min-w-0 items-center gap-2.5 rounded-xl p-2 text-start transition-colors hover:bg-soft',
          collapsed && 'lg:justify-center lg:p-1.5',
        )}
      >
        <Avatar name={shownName} src={me?.avatar} fallback={t('account.initialFallback')} />
        <span className={cn('min-w-0 flex-1 leading-tight', collapsed && 'lg:sr-only')}>
          <span className="block truncate text-[14px] font-bold text-ink" data-testid="account-user-name">
            {shownName}
          </span>
          {me ? (
            <span className="fa-digits ltr block truncate text-start text-[11.5px] text-muted" data-testid="account-user-phone">
              {formatPhone(me.phone_number)}
            </span>
          ) : (
            <Skeleton className="mt-1 h-3 w-24" />
          )}
        </span>
      </button>
    </DropdownTrigger>
  );

  return (
    <div className="shrink-0 border-t border-line p-3">
      <DropdownRoot>
        {collapsed ? (
          <Tip label={shownName} side="left">
            {trigger}
          </Tip>
        ) : (
          trigger
        )}
        <DropdownContent side="top" align="start">
          <DropdownLabel>
            <div className="font-semibold text-ink">{shownName}</div>
            {me ? <div className="fa-digits ltr mt-0.5 text-start text-xs text-muted">{formatPhone(me.phone_number)}</div> : null}
          </DropdownLabel>
          <div className="px-3 pb-2 md:hidden">
            <PlanBadge />
          </div>
          {/* In Iran the site is in Persian and has no language choice. */}
          {market === 'IR' ? null : (
            <div className="px-3 pb-2">
              <LanguageSwitcher />
            </div>
          )}
          <DropdownSeparator />
          <DropdownItem onSelect={() => router.push('/dashboard/subscription')} icon={<WalletIcon className="h-4 w-4" />}>
            {t('account.subscription')}
          </DropdownItem>
          <DropdownItem danger disabled={leaving} onSelect={logout} icon={<LogOut className="h-4 w-4" />}>
            {t('account.logout')}
          </DropdownItem>
        </DropdownContent>
      </DropdownRoot>
    </div>
  );
}

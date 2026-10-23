'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut, Menu, Plus, UserRound, Wallet as WalletIcon } from 'lucide-react';
import { mutate } from 'swr';
import { toast } from 'sonner';
import { authPost } from '@/lib/api';
import { formatNumber, formatPhone } from '@/lib/format';
import { PLAN_LABEL } from '@/lib/labels';
import { useMe, useWallet } from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { titleFor } from './nav';

function PlanBadge() {
  const { data: wallet, error } = useWallet();
  if (!wallet && !error) return <Skeleton className="h-7 w-28 rounded-full" />;
  const sub = wallet?.subscription;
  if (sub?.is_active && sub.package_type) {
    return (
      <Link href="/dashboard/subscription" aria-label="جزئیات اشتراک">
        <Badge tone="gold" className="gap-1.5 py-1 text-[13px]">
          <WalletIcon aria-hidden className="h-3.5 w-3.5" />
          اشتراک {PLAN_LABEL[sub.package_type]}
          <span className="font-normal text-accent-text/80">· {formatNumber(sub.remaining_days)} روز مانده</span>
        </Badge>
      </Link>
    );
  }
  return (
    <Link href="/dashboard/subscription" aria-label="خرید اشتراک">
      <Badge tone="neutral" className="gap-1.5 border-line-strong py-1 text-[13px] hover:border-primary hover:text-primary">
        <WalletIcon aria-hidden className="h-3.5 w-3.5" />
        بدون اشتراک · خرید پلن
      </Badge>
    </Link>
  );
}

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    try {
      await authPost('logout');
    } catch {
      /* the cookie is cleared by the next 401 anyway */
    }
    await mutate(() => true, undefined, { revalidate: false }); // forget everything cached for this account
    toast.success('از حساب خارج شدید.');
    router.replace('/login');
    router.refresh();
  }

  const name = me?.full_name?.trim() || 'کاربر بنگاه';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onOpenMenu}
        aria-label="باز کردن منو"
        className="rounded-lg p-2 text-ink-2 hover:bg-soft lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="hidden truncate text-[15px] font-bold text-ink sm:block">{titleFor(pathname)}</h1>

      <div className="ms-auto flex items-center gap-2 sm:gap-3">
        <div className="hidden md:block">
          <PlanBadge />
        </div>
        <Link href="/dashboard/listings/quick-add">
          <Button size="md" className="gap-1.5">
            <Plus aria-hidden className="h-4 w-4" strokeWidth={2.6} />
            <span>ثبت آگهی جدید</span>
          </Button>
        </Link>

        <DropdownRoot>
          <DropdownTrigger asChild>
            <button
              aria-label="حساب کاربری"
              className="flex items-center gap-2 rounded-xl border border-line py-1 pe-3 ps-1 hover:border-primary"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-tint text-primary">
                <UserRound aria-hidden className="h-4.5 w-4.5" />
              </span>
              <span className="hidden max-w-32 truncate text-[13px] font-semibold text-ink-2 sm:block">{name}</span>
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>
              <div className="font-semibold text-ink">{name}</div>
              {me ? <div className="ltr mt-0.5 text-start text-xs text-muted">{formatPhone(me.phone_number)}</div> : null}
            </DropdownLabel>
            <div className="px-3 pb-2 md:hidden">
              <PlanBadge />
            </div>
            <DropdownSeparator />
            <DropdownItem onSelect={() => router.push('/dashboard/subscription')} icon={<WalletIcon className="h-4 w-4" />}>
              اشتراک و سهمیه
            </DropdownItem>
            <DropdownItem danger disabled={leaving} onSelect={logout} icon={<LogOut className="h-4 w-4" />}>
              خروج از حساب
            </DropdownItem>
          </DropdownContent>
        </DropdownRoot>
      </div>
    </header>
  );
}

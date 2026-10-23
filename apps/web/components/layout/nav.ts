import { BarChart3, FileSpreadsheet, LayoutDashboard, List, Map as MapIcon, Wallet, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The link is lit for any path that starts with this (default: the href itself). */
  match?: string;
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'نمای کلی', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/listings', label: 'مدیریت آگهی‌ها', icon: List, exact: true },
  { href: '/dashboard/listings/quick-add', label: 'ثبت سریع و گروهی', icon: FileSpreadsheet },
  { href: '/dashboard/map', label: 'نقشه دفتر', icon: MapIcon },
  { href: '/dashboard/subscription', label: 'اشتراک و سهمیه', icon: Wallet },
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function titleFor(pathname: string): string {
  const hit = [...NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(i, pathname));
  return hit?.label ?? 'پنل بنگاه';
}

export { BarChart3 };

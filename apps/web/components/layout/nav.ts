import {
  BarChart3,
  FileSpreadsheet,
  Gift,
  LayoutDashboard,
  List,
  Map as MapIcon,
  MessageCircleHeart,
  MessageSquare,
  MessageSquareText,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { MessageKey } from '@/i18n/translate';

export interface NavItem {
  href: string;
  /** The message key of the link's name (translated where it is shown). */
  labelKey: MessageKey;
  icon: LucideIcon;
  /** The link is lit for any path that starts with this (default: the href itself). */
  match?: string;
  exact?: boolean;
  /** Only an admin account sees the link (the API refuses everyone else regardless). */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard/map', labelKey: 'nav.map', icon: MapIcon },
  { href: '/dashboard', labelKey: 'nav.overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/listings', labelKey: 'nav.listings', icon: List, exact: true },
  { href: '/dashboard/listings/quick-add', labelKey: 'nav.quickAdd', icon: FileSpreadsheet },
  { href: '/dashboard/chat', labelKey: 'nav.chat', icon: MessageSquare },
  { href: '/dashboard/subscription', labelKey: 'nav.subscription', icon: Wallet },
  { href: '/dashboard/admin', labelKey: 'nav.adminHome', icon: LayoutDashboard, exact: true, adminOnly: true },
  { href: '/dashboard/admin/listings', labelKey: 'nav.adminListings', icon: List, adminOnly: true },
  { href: '/dashboard/admin/agencies', labelKey: 'nav.adminAgencies', icon: Store, adminOnly: true },
  { href: '/dashboard/admin/users', labelKey: 'nav.adminUsers', icon: Users, adminOnly: true },
  { href: '/dashboard/admin/payments', labelKey: 'nav.adminPayments', icon: ShieldCheck, adminOnly: true },
  { href: '/dashboard/admin/feedback', labelKey: 'nav.adminFeedback', icon: MessageSquareText, adminOnly: true },
  { href: '/dashboard/admin/gifts', labelKey: 'nav.adminGifts', icon: Gift, adminOnly: true },
  { href: '/dashboard/admin/greetings', labelKey: 'nav.adminGreetings', icon: MessageCircleHeart, adminOnly: true },
];

/** An admin account works in the admin section only: it has no listings, plan or office of its own. */
export const ADMIN_HOME = '/dashboard/admin';

/** The links an account sees: an admin the admin section, everyone else the personal pages. */
export function navItemsFor(role: string | undefined): NavItem[] {
  return role === 'ADMIN' ? NAV_ITEMS.filter((item) => item.adminOnly) : NAV_ITEMS.filter((item) => !item.adminOnly);
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function titleKeyFor(pathname: string): MessageKey {
  const hit = [...NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(i, pathname));
  return hit?.labelKey ?? 'nav.fallbackTitle';
}

export { BarChart3 };

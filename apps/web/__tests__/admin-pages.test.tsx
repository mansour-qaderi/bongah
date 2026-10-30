// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const post = vi.fn();
const put = vi.fn();
const patch = vi.fn();
const del = vi.fn();
const replace = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const mutate = vi.fn(async () => undefined);
let me: { role: string } | undefined;
let pathname = '/dashboard/admin';
let query = '';
/** What each admin address answers, matched by the start of the SWR key. */
let feed: (key: string) => unknown;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));
vi.mock('swr', () => ({
  default: (key: string | null) => ({ data: key ? feed(key) : undefined, error: undefined, mutate }),
  mutate: vi.fn(),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    fetcher: vi.fn(),
    api: {
      ...actual.api,
      post: (...a: unknown[]) => post(...a),
      put: (...a: unknown[]) => put(...a),
      patch: (...a: unknown[]) => patch(...a),
      delete: (...a: unknown[]) => del(...a),
    },
  };
});
vi.mock('@/hooks/use-api', () => ({
  useMe: () => ({ data: me, error: undefined }),
  useDashboard: () => ({ data: undefined, error: undefined }),
  useWallet: () => ({ data: undefined, error: undefined }),
}));

import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { AdminListings } from '@/components/admin/admin-listings';
import { AdminAgencies } from '@/components/admin/admin-agencies';
import { AdminUsers } from '@/components/admin/admin-users';
import { AdminFeedback } from '@/components/admin/admin-feedback';
import { AdminGifts } from '@/components/admin/admin-gifts';
import { AdminGreetings } from '@/components/admin/admin-greetings';
import { AdminHome } from '@/components/admin/admin-home';
import { AgencyGate } from '@/components/layout/agency-gate';
import { PlanBadge } from '@/components/layout/plan-badge';
import { NAV_ITEMS, navItemsFor, titleKeyFor } from '@/components/layout/nav';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('prs', key, vars);
const wrap = (node: React.ReactNode) => render(<LanguageProvider initialLanguage="prs">{node}</LanguageProvider>);
const page = <T,>(rows: T[]) => ({ data: rows, meta: { total: rows.length, total_pages: 1, page: 1, limit: 20 } });
const person = (over = {}) => ({ id: 'u1', full_name: 'احمد', phone_number: '+93790049201', banned_at: null, ...over });

beforeEach(() => {
  me = { role: 'ADMIN' };
  pathname = '/dashboard/admin';
  query = '';
  feed = () => undefined;
  for (const m of [post, put, patch, del, replace, toastSuccess, toastError, mutate]) m.mockClear();
  post.mockResolvedValue({});
  put.mockResolvedValue({});
  patch.mockResolvedValue({});
  del.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe('the admin menu and the gate', () => {
  it('shows an admin only the admin section, with every tool in it', () => {
    const hrefs = navItemsFor('ADMIN').map((i) => i.href);
    expect(hrefs).toEqual([
      '/dashboard/admin',
      '/dashboard/admin/listings',
      '/dashboard/admin/agencies',
      '/dashboard/admin/users',
      '/dashboard/admin/payments',
      '/dashboard/admin/feedback',
      '/dashboard/admin/gifts',
      '/dashboard/admin/greetings',
    ]);
    const personal = navItemsFor('AGENCY').map((i) => i.href);
    expect(personal.some((h) => h.startsWith('/dashboard/admin'))).toBe(false);
    expect(personal).toContain('/dashboard/map');
    expect(NAV_ITEMS.every((i) => !i.adminOnly || i.href.startsWith('/dashboard/admin'))).toBe(true);
  });

  it('titles each admin page by its own name, and the landing page by the home name', () => {
    expect(titleKeyFor('/dashboard/admin')).toBe('nav.adminHome');
    expect(titleKeyFor('/dashboard/admin/users')).toBe('nav.adminUsers');
    expect(titleKeyFor('/dashboard/admin/greetings')).toBe('nav.adminGreetings');
  });

  it('sends an admin who lands on a personal page to the admin section, with no blocking notice', async () => {
    pathname = '/dashboard/map';
    wrap(
      <AgencyGate>
        <div data-testid="child" />
      </AgencyGate>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/admin'));
    expect(screen.queryByTestId('child')).toBeNull();
    expect(screen.queryByTestId('setup-admin-notice')).toBeNull();
  });

  it('lets an admin through on the admin pages', () => {
    pathname = '/dashboard/admin/users';
    wrap(
      <AgencyGate>
        <div data-testid="child" />
      </AgencyGate>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('leaves a normal account on its own pages', () => {
    me = { role: 'AGENCY' };
    pathname = '/dashboard/map';
    wrap(
      <AgencyGate>
        <div data-testid="child" />
      </AgencyGate>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows no «buy a plan» badge to an admin', () => {
    const { container } = wrap(<PlanBadge />);
    expect(container.textContent).toBe('');
  });

  it('tells anyone but an admin that the admin pages are not theirs', () => {
    me = { role: 'USER' };
    feed = () => page([]);
    wrap(<AdminUsers />);
    expect(screen.getByTestId('admin-only').textContent).toContain(t('adm.notAdmin'));
    expect(screen.queryByTestId('admin-us-table')).toBeNull();
  });
});

describe('the overview', () => {
  it('shows the numbers and a door to every section', () => {
    feed = () => ({
      users: { total: 120, new_in_range: 7 },
      listings: { active: 55, new_in_range: 4 },
      agencies: { with_active_subscription: 9, verified: 12 },
      moderation: { pending_verifications: 2, open_reports: 1 },
      revenue: { in_range: [{ currency: 'AFGHANI', total: 4500 }] },
    });
    wrap(<AdminHome />);
    expect(screen.getByTestId('admin-home-stats').textContent).toContain('۱۲۰');
    const doors = within(screen.getByTestId('admin-home-sections')).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(doors).toEqual(navItemsFor('ADMIN').filter((i) => i.href !== '/dashboard/admin').map((i) => i.href));
  });
});

describe('listings', () => {
  const listing = (over = {}) => ({
    id: 'p1',
    title: 'خانه در کابل',
    price: 90000,
    currency: 'USD',
    status: 'ACTIVE',
    is_featured: false,
    view_count: 3,
    removed_by_admin_at: null,
    removal_reason: null,
    created_at: '2026-10-28T08:00:00Z',
    owner: person(),
    ...over,
  });

  it('features a listing for the number of days typed', async () => {
    feed = () => page([listing()]);
    wrap(<AdminListings />);
    fireEvent.click(screen.getByTestId('admin-ls-feature'));
    fireEvent.change(await screen.findByTestId('admin-feature-days'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('admin-feature-confirm'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/properties/p1/feature', { days: 10 }));
    expect(toastSuccess).toHaveBeenCalledWith(t('adm.ls.featureDone'));
  });

  it('will not take a listing down without a reason, then sends it', async () => {
    feed = () => page([listing()]);
    wrap(<AdminListings />);
    fireEvent.click(screen.getByTestId('admin-ls-remove'));
    const confirm = await screen.findByTestId('admin-reason-confirm');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('admin-reason'), { target: { value: 'آگهی تکراری' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/properties/p1/remove', { reason: 'آگهی تکراری' }));
  });

  it('ends a running feature and restores a taken-down listing', async () => {
    feed = () =>
      page([listing({ is_featured: true }), listing({ id: 'p2', removed_by_admin_at: '2026-10-28T09:00:00Z', removal_reason: 'تکراری' })]);
    wrap(<AdminListings />);
    fireEvent.click(screen.getByTestId('admin-ls-unfeature'));
    await waitFor(() => expect(del).toHaveBeenCalledWith('admin/properties/p1/feature'));
    fireEvent.click(screen.getByTestId('admin-ls-restore'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/properties/p2/restore'));
  });

  it('says so when there is nothing to show', () => {
    feed = () => page([]);
    wrap(<AdminListings />);
    expect(screen.getByText(t('adm.empty'))).toBeTruthy();
  });
});

describe('agencies', () => {
  const agency = (over = {}) => ({
    id: 'a1',
    agency_name: 'بنگاه آریانا',
    license_photo: 'https://x.test/l.jpg',
    address: 'کابل',
    verification_status: 'PENDING',
    rejection_reason: null,
    subscription_active: true,
    created_at: '2026-10-28T08:00:00Z',
    owner: person(),
    ...over,
  });

  it('approves a pending agency', async () => {
    feed = () => page([agency()]);
    wrap(<AdminAgencies />);
    fireEvent.click(screen.getByTestId('admin-ag-approve'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('admin/agencies/a1/verification', { status: 'VERIFIED' }));
  });

  it('refuses an agency only with a reason', async () => {
    feed = () => page([agency()]);
    wrap(<AdminAgencies />);
    fireEvent.click(screen.getByTestId('admin-ag-reject'));
    fireEvent.change(await screen.findByTestId('admin-reason'), { target: { value: 'مجوز واضح نیست' } });
    fireEvent.click(screen.getByTestId('admin-reason-confirm'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('admin/agencies/a1/verification', { status: 'REJECTED', reason: 'مجوز واضح نیست' }));
  });
});

describe('accounts', () => {
  const user = (over = {}) => ({
    ...person(),
    role: 'USER',
    listing_credits: 2,
    featured_credits: 1,
    ban_reason: null,
    last_login_at: null,
    created_at: '2026-10-01T08:00:00Z',
    agency: null,
    open_reports_against: 0,
    ...over,
  });

  it('suspends an account with a reason, lifts a suspension, and never offers a ban for an admin', async () => {
    feed = () =>
      page([user({ id: 'u1' }), user({ id: 'u2', banned_at: '2026-10-20T08:00:00Z', ban_reason: 'اسپم' }), user({ id: 'u3', role: 'ADMIN' })]);
    wrap(<AdminUsers />);
    expect(screen.getAllByTestId('admin-us-ban')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('admin-us-ban'));
    fireEvent.change(await screen.findByTestId('admin-reason'), { target: { value: 'رفتار نامناسب' } });
    fireEvent.click(screen.getByTestId('admin-reason-confirm'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/users/u1/ban', { reason: 'رفتار نامناسب' }));
    fireEvent.click(screen.getByTestId('admin-us-unban'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/users/u2/unban'));
  });

  it('links each account to the gift page with the account chosen', () => {
    feed = () => page([user({ id: 'u1' })]);
    wrap(<AdminUsers />);
    const link = within(screen.getByTestId('admin-us-row')).getByRole('link');
    expect(link.getAttribute('href')).toBe('/dashboard/admin/gifts?user=u1');
  });
});

describe('feedback', () => {
  it('lists the messages with who sent them and from which version', () => {
    feed = () =>
      page([
        { id: 'f1', category: 'PROBLEM', message: 'نقشه باز نمی‌شود', app_version: '2.1.3', created_at: '2026-10-28T08:00:00Z', user: person() },
      ]);
    wrap(<AdminFeedback />);
    const item = screen.getByTestId('admin-fb-item');
    expect(item.textContent).toContain('نقشه باز نمی‌شود');
    expect(item.textContent).toContain(t('adm.fb.cat.PROBLEM'));
    expect(item.textContent).toContain('۲.۱.۳');
  });

  it('has an empty state', () => {
    feed = () => page([]);
    wrap(<AdminFeedback />);
    expect(screen.getByText(t('adm.fb.empty'))).toBeTruthy();
  });

  const unanswered = { id: 'f1', category: 'PROBLEM', message: 'نقشه باز نمی‌شود', app_version: '2.1.3', created_at: '2026-10-28T08:00:00Z', user: person(), reply: null };

  it('has a «پاسخ به کاربر» button on every message, and sends the reply to that message', async () => {
    feed = () => page([unanswered]);
    post.mockResolvedValue({ item: { ...unanswered, reply: { message: 'درست شد', replied_at: '2026-10-29T08:00:00Z' } }, notified: true });
    wrap(<AdminFeedback />);
    const button = within(screen.getByTestId('admin-fb-item')).getByTestId('admin-fb-reply');
    expect(button.textContent).toContain(t('adm.fb.reply'));
    fireEvent.click(button);
    // The message being answered is shown above the box.
    await screen.findByTestId('admin-fb-reply-input');
    expect(screen.getByRole('dialog').textContent).toContain('نقشه باز نمی‌شود');
    const send = screen.getByTestId('admin-fb-reply-send') as HTMLButtonElement;
    fireEvent.change(screen.getByTestId('admin-fb-reply-input'), { target: { value: 'ا' } });
    expect(send.disabled).toBe(true); // too short to send
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('admin-fb-reply-input'), { target: { value: 'درست شد، نسخهٔ تازه را بگیرید' } });
    fireEvent.click(send);
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/feedback/f1/reply', { message: 'درست شد، نسخهٔ تازه را بگیرید' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(t('adm.fb.replySent')));
  });

  it('says when the reply was saved but no device could be told', async () => {
    feed = () => page([unanswered]);
    post.mockResolvedValue({ item: unanswered, notified: false });
    wrap(<AdminFeedback />);
    fireEvent.click(screen.getByTestId('admin-fb-reply'));
    fireEvent.change(await screen.findByTestId('admin-fb-reply-input'), { target: { value: 'سلام، بررسی می‌کنیم' } });
    fireEvent.click(screen.getByTestId('admin-fb-reply-send'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(t('adm.fb.replySaved')));
  });

  it('shows an answer already given, and offers to answer again', () => {
    feed = () => page([{ ...unanswered, reply: { message: 'درست شد', replied_at: '2026-10-29T08:00:00Z' } }]);
    wrap(<AdminFeedback />);
    expect(screen.getByTestId('admin-fb-reply-text').textContent).toContain('درست شد');
    expect(screen.getByTestId('admin-fb-reply').textContent).toContain(t('adm.fb.replyAgain'));
  });
});

describe('gifts', () => {
  const target = { ...person({ id: 'u2', full_name: 'سارا' }), role: 'USER', listing_credits: 1, featured_credits: 0 };

  it('gives a chosen account free listings and featured frames, with a note', async () => {
    query = 'user=u2';
    feed = (key) => (key === 'admin/users/u2' ? target : key.startsWith('admin/audit-log') ? page([]) : page([]));
    post.mockResolvedValue({ ...target, listing_credits: 4, featured_credits: 1 });
    wrap(<AdminGifts />);
    expect((await screen.findByTestId('admin-gift-form')).textContent).toContain('سارا');
    const give = screen.getByTestId('admin-gift-give') as HTMLButtonElement;
    expect(give.disabled).toBe(true); // nothing to give yet
    fireEvent.change(screen.getByTestId('admin-gift-listings'), { target: { value: '۳' } });
    fireEvent.change(screen.getByTestId('admin-gift-featured'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('admin-gift-note'), { target: { value: 'جبران مشکل' } });
    fireEvent.click(give);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('admin/users/u2/gift', { listing_credits: 3, featured_credits: 1, note: 'جبران مشکل' }),
    );
    expect(toastSuccess).toHaveBeenCalledWith(t('adm.gift.given'));
  });

  it('takes a count only as a number: letters never get into the boxes, and the buttons step by one', async () => {
    query = 'user=u2';
    feed = (key) => (key === 'admin/users/u2' ? target : page([]));
    wrap(<AdminGifts />);
    await screen.findByTestId('admin-gift-form');
    const listings = screen.getByTestId('admin-gift-listings') as HTMLInputElement;
    const featured = screen.getByTestId('admin-gift-featured') as HTMLInputElement;
    // Text such as «یسب» (or «abc») is dropped: the box stays empty.
    fireEvent.change(listings, { target: { value: 'یسب' } });
    expect(listings.value).toBe('');
    fireEvent.change(featured, { target: { value: 'abc' } });
    expect(featured.value).toBe('');
    // Digits in any script count, and the box is held at the most one gift may carry.
    fireEvent.change(listings, { target: { value: '۳' } });
    expect(listings.value).toBe('۳');
    fireEvent.change(listings, { target: { value: '۹۹۹' } });
    expect(listings.value).toBe('۵۰');
    expect(screen.getAllByRole('button', { name: t('adm.gift.increase') })[0]).toHaveProperty('disabled', true);
    // The − and + buttons.
    fireEvent.click(screen.getAllByRole('button', { name: t('adm.gift.increase') })[1]!);
    fireEvent.click(screen.getAllByRole('button', { name: t('adm.gift.increase') })[1]!);
    expect(featured.value).toBe('۲');
    fireEvent.click(screen.getAllByRole('button', { name: t('adm.gift.decrease') })[1]!);
    expect(featured.value).toBe('۱');
  });

  it('asks for an account first', () => {
    feed = () => page([]);
    wrap(<AdminGifts />);
    expect(screen.getByText(t('adm.gift.pickFirst'))).toBeTruthy();
  });

  it('lists the gifts given lately', () => {
    feed = (key) =>
      key.startsWith('admin/audit-log')
        ? page([{ id: 'e1', action: 'USER_GIFTED', target_type: 'user', target_id: 'u2', created_at: '2026-10-28T08:00:00Z', actor: null, metadata: { listing_credits: 2, featured_credits: 1, note: 'هدیه عید' } }])
        : page([]);
    wrap(<AdminGifts />);
    const recent = screen.getByTestId('admin-gift-recent');
    expect(recent.textContent).toContain('هدیه عید');
    expect(recent.textContent).toContain('۲');
  });
});

describe('daily greetings', () => {
  const quote = (over = {}) => ({
    id: 'q1',
    text: 'روز خوبی داشته باشید',
    category: 'WELCOME_ONBOARDING',
    language: 'prs',
    is_active: true,
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-01T08:00:00Z',
    ...over,
  });
  beforeEach(() => {
    feed = (key) => (key.startsWith('admin/notifications/morning') ? [{ day: '2026-10-28', claimed: 5, sent: 4, failed: 1 }] : page([quote()]));
  });

  it('shows the texts and the last mornings', () => {
    wrap(<AdminGreetings />);
    expect(screen.getByTestId('admin-gr-item').textContent).toContain('روز خوبی داشته باشید');
    expect(within(screen.getByTestId('admin-gr-stats')).getByText('2026-10-28')).toBeTruthy();
  });

  it('switches a text off without deleting it', async () => {
    wrap(<AdminGreetings />);
    fireEvent.click(within(screen.getByTestId('admin-gr-item')).getByRole('switch'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('admin/quotes/q1', { is_active: false }));
  });

  it('opens on «پیام صبحگاهی», with «کارت خوش‌آمدگویی» second', () => {
    wrap(<AdminGreetings />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([t('adm.gr.cat.MORNING_NOTIFICATION'), t('adm.gr.cat.WELCOME_ONBOARDING')]);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false');
  });

  it('adds a text to the tab that is open (the morning message first)', async () => {
    wrap(<AdminGreetings />);
    fireEvent.click(screen.getByTestId('admin-gr-add'));
    fireEvent.change(await screen.findByTestId('admin-gr-text'), { target: { value: 'صبح بخیر' } });
    fireEvent.click(screen.getByTestId('admin-gr-save'));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('admin/quotes', { text: 'صبح بخیر', category: 'MORNING_NOTIFICATION', language: 'prs', is_active: true }),
    );
  });

  it('edits and deletes a text', async () => {
    wrap(<AdminGreetings />);
    fireEvent.click(screen.getByTestId('admin-gr-edit'));
    fireEvent.change(await screen.findByTestId('admin-gr-text'), { target: { value: 'متن تازه' } });
    fireEvent.click(screen.getByTestId('admin-gr-save'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('admin/quotes/q1', expect.objectContaining({ text: 'متن تازه' })));
    fireEvent.click(screen.getByTestId('admin-gr-delete'));
    fireEvent.click(await screen.findByRole('button', { name: t('adm.ls.remove') }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('admin/quotes/q1'));
  });

  it('sends a test notification and says how many devices it reached', async () => {
    post.mockResolvedValue({ devices: 2, delivered: 2, failed: 0 });
    wrap(<AdminGreetings />);
    fireEvent.click(screen.getByTestId('admin-gr-test'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/notifications/test'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(t('adm.gr.testDone', { delivered: '۲', devices: '۲' })));
  });
});

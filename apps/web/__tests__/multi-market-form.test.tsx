// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const post = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/dashboard/quick-add' }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('swr', () => ({ mutate: vi.fn(async () => undefined), default: vi.fn() }));
vi.mock('@/hooks/use-api', () => ({ useMe: () => ({ data: { id: 'u1', market: 'AF' }, mutate: vi.fn() }), useWallet: () => ({ data: undefined }) }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: { post: (...a: unknown[]) => post(...a), get: vi.fn(async () => null) },
}));
vi.mock('@/lib/listing-actions', () => ({
  refreshListingData: vi.fn(async () => undefined),
  withBackoff: async (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/components/map/location-picker', () => ({ LocationPicker: () => <div data-testid="picker" /> }));
vi.mock('@/components/quick-add/image-picker', () => ({ ImagePicker: () => <div /> }));

import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { SingleForm } from '@/components/quick-add/single-form';
import { setActiveMarket } from '@/lib/market';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('prs', key, vars);

const rx = (key: Parameters<typeof translate>[1]) => new RegExp(t(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const start = (key: Parameters<typeof translate>[1]) => new RegExp(`^${t(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

beforeEach(() => {
  window.localStorage.clear();
  setActiveMarket('AF');
  post.mockReset();
});
afterEach(() => cleanup());

/** The form has no country buttons: it works in the market the site is in (found from the position, or chosen in the account menu). */
function mount(market: 'AF' | 'IR' = 'AF') {
  setActiveMarket(market);
  render(
    <LanguageProvider initialLanguage="prs">
      <SingleForm />
    </LanguageProvider>,
  );
}

function optionsOf(name: string | RegExp): string[] {
  const trigger = screen.getByRole('combobox', { name });
  fireEvent.click(trigger);
  const names = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent ?? '');
  fireEvent.keyDown(trigger, { key: 'Escape' });
  return names;
}
const radios = (group: string) => within(screen.getByRole('radiogroup', { name: group })).getAllByRole('radio').map((r) => r.textContent);
const checked = (group: string) => within(screen.getByRole('radiogroup', { name: group })).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent);

describe('the listing form', () => {
  it("starts in the account's market: Afghan currencies, deals, kinds and provinces", () => {
    mount();
    // There is no country choice on the form any more.
    expect(screen.queryByRole('radiogroup', { name: t('market.field') })).toBeNull();
    expect(screen.queryByTestId('form-market-IR')).toBeNull();
    expect(screen.queryByTestId('form-market-AF')).toBeNull();
    expect(radios(t('import.field.currency'))).toEqual(['افغانی', 'دالر']);
    // A daily rental («باغ و ویلا») is offered in Afghanistan too.
    expect(radios(t('filter.deal'))).toEqual(['فروشی', 'کرایی', 'گروی', 'اجاره روزانه']);
    const types = optionsOf(rx('filter.type'));
    expect(types).not.toContain('دوبلکس');
    expect(types).toEqual(expect.arrayContaining(['خانه / حویلی', 'آپارتمان', 'دکان', 'زمین', 'گدام']));
    expect(optionsOf(rx('import.field.province'))).toContain('کابل');
    // Afghanistan has the deed (قباله شرعی / عرفی), not Iran's tags.
    expect(optionsOf(rx('form.deed'))).toEqual(expect.arrayContaining(['قباله شرعی', 'عرفی']));
    expect(screen.queryByTestId('form-features')).toBeNull();
    expect(screen.queryByTestId('form-monthly-rent')).toBeNull();
  });

  it('in Iran: tomans only, the Iranian deals and kinds, and no province box', async () => {
    mount('IR');
    await waitFor(() => expect(radios(t('import.field.currency'))).toEqual(['تومان']));
    expect(radios(t('filter.deal'))).toEqual(['فروش', 'اجاره', 'رهن کامل', 'اجاره روزانه']);
    // Exactly Iran's six kinds of property.
    expect(optionsOf(rx('filter.type')).filter((o) => o && o !== t('common.choose'))).toEqual(['آپارتمان', 'خانه / ویلایی', 'باغ و ویلا', 'زمین', 'خانه کلنگی', 'تجاری و اداری']);
    // Its tags, and no deed.
    const tags = within(screen.getByTestId('form-features')).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'));
    expect(tags).toEqual(['دوبلکس', 'پنت‌هاوس', 'سند تک‌برگ', 'مستر روم', 'آسانسور', 'پارکینگ', 'انباری']);
    expect(screen.queryByRole('combobox', { name: rx('form.deed') })).toBeNull();
    // Iran has no «select province»: the place is the address and the pin.
    expect(screen.queryByRole('combobox', { name: rx('import.field.province') })).toBeNull();
    expect(screen.getByRole('combobox', { name: start('import.field.address') }).getAttribute('placeholder')).toBe('مثلاً سعادت‌آباد، خیابان فرهنگ');
    expect(checked(t('import.field.currency'))).toEqual(['تومان']); // the pinned dollars were an Afghan habit
  });

  it('only offers a villa or a garden for a daily rental', async () => {
    mount('IR');
    await waitFor(() => screen.getByRole('radio', { name: 'اجاره روزانه' }));
    fireEvent.click(screen.getByRole('radio', { name: 'اجاره روزانه' }));
    expect(optionsOf(rx('filter.type')).filter((o) => o && o !== '—' && o !== t('common.choose'))).toEqual(['باغ و ویلا']);
  });

  it('keeps Iran’s form in Iran and offers no rial or dollar (the country is not a choice on the form)', () => {
    mount('IR');
    expect(screen.queryByRole('radio', { name: 'ریال' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'دالر' })).toBeNull();
    expect(checked(t('import.field.currency'))).toEqual(['تومان']);
    expect(screen.queryByRole('radiogroup', { name: t('market.field') })).toBeNull();
    expect(radios(t('filter.deal'))).toEqual(['فروش', 'اجاره', 'رهن کامل', 'اجاره روزانه']);
  });

  it('offers a daily rental in Afghanistan too, for a garden or a villa only', () => {
    mount('AF');
    fireEvent.click(screen.getByRole('radio', { name: 'اجاره روزانه' }));
    const kinds = optionsOf(rx('filter.type')).filter((o) => o && o !== '—' && o !== t('common.choose'));
    expect(kinds).toEqual(['باغ', 'ویلا']); // Afghanistan keeps the garden and the villa apart
  });

  it('sends the listing with its market and the Iranian price', async () => {
    post.mockResolvedValue({ id: 'p1' });
    mount('IR');
    await waitFor(() => screen.getByRole('radio', { name: 'اجاره روزانه' }));
    fireEvent.click(screen.getByRole('radio', { name: 'اجاره روزانه' }));
    fireEvent.click(screen.getByRole('combobox', { name: rx('filter.type') }));
    fireEvent.click(screen.getByRole('option', { name: 'باغ و ویلا' }));
    fireEvent.change(screen.getByRole('textbox', { name: start('import.field.price') }), { target: { value: '3500000' } });
    fireEvent.change(screen.getByRole('textbox', { name: start('form.areaLabel') }), { target: { value: '400' } });
    fireEvent.change(screen.getByRole('combobox', { name: start('import.field.address') }), { target: { value: 'نوشهر، خیابان ساحلی' } });
    fireEvent.change(screen.getByRole('textbox', { name: start('import.field.title') }), { target: { value: 'ویلای ساحلی برای اجاره روزانه' } });
    fireEvent.click(screen.getByRole('button', { name: t('form.saveNext') }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![0]).toBe('properties');
    expect(post.mock.calls[0]![1]).toMatchObject({ market: 'IR', type: 'VILLA_GARDEN', deal_type: 'DAILY_RENT', currency: 'TOMAN', price: 3_500_000 });
    expect(post.mock.calls[0]![1].province ?? '').toBe(''); // Iran sends no province
  });

  /** Fills the rest of an Iranian apartment: area, province, address, title. */
  function fillBasics() {
    fireEvent.change(screen.getByRole('textbox', { name: start('form.areaLabel') }), { target: { value: '85' } });
    fireEvent.change(screen.getByRole('combobox', { name: start('import.field.address') }), { target: { value: 'سعادت آباد' } });
    fireEvent.change(screen.getByRole('textbox', { name: start('import.field.title') }), { target: { value: 'آپارتمان رهن و اجاره' } });
  }

  it('asks a mortgage-and-rent for the deposit and the monthly rent apart, and sends both', async () => {
    post.mockResolvedValue({ id: 'p2' });
    mount('IR');
    await waitFor(() => screen.getByRole('radio', { name: 'اجاره' }));
    expect(screen.queryByTestId('form-monthly-rent')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'اجاره' }));
    // The price box is now the deposit, and the rent has its own box.
    expect(screen.getByRole('textbox', { name: start('form.deposit') })).toBeTruthy();
    expect(screen.getByTestId('form-monthly-rent')).toBeTruthy();
    fireEvent.click(screen.getByRole('combobox', { name: rx('filter.type') }));
    fireEvent.click(screen.getByRole('option', { name: 'آپارتمان' }));
    fireEvent.change(screen.getByRole('textbox', { name: start('form.deposit') }), { target: { value: '200000000' } });
    fillBasics();
    // Without the rent it is refused here, before the API is asked.
    fireEvent.click(screen.getByRole('button', { name: t('form.saveNext') }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('form-monthly-rent'), { target: { value: '8000000' } });
    fireEvent.click(within(screen.getByTestId('form-features')).getByRole('checkbox', { name: 'آسانسور' }));
    fireEvent.click(within(screen.getByTestId('form-features')).getByRole('checkbox', { name: 'پارکینگ' }));
    fireEvent.click(screen.getByRole('button', { name: t('form.saveNext') }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).toMatchObject({
      market: 'IR',
      type: 'APARTMENT',
      deal_type: 'MORTGAGE_RENT',
      price: 200_000_000,
      monthly_rent: 8_000_000,
      features: ['ELEVATOR', 'PARKING'],
    });
  });

  it('lets go of the monthly rent when the deal is changed to a sale', async () => {
    post.mockResolvedValue({ id: 'p3' });
    mount('IR');
    await waitFor(() => screen.getByRole('radio', { name: 'اجاره' }));
    fireEvent.click(screen.getByRole('radio', { name: 'اجاره' }));
    fireEvent.change(screen.getByTestId('form-monthly-rent'), { target: { value: '8000000' } });
    fireEvent.click(screen.getByRole('radio', { name: 'فروش' }));
    expect(screen.queryByTestId('form-monthly-rent')).toBeNull();
    fireEvent.click(screen.getByRole('combobox', { name: rx('filter.type') }));
    fireEvent.click(screen.getByRole('option', { name: 'آپارتمان' }));
    fireEvent.change(screen.getByRole('textbox', { name: start('import.field.price') }), { target: { value: '9000000000' } });
    fillBasics();
    fireEvent.click(screen.getByRole('button', { name: t('form.saveNext') }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).not.toHaveProperty('monthly_rent');
    expect(post.mock.calls[0]![1]).toMatchObject({ deal_type: 'SALE', price: 9_000_000_000 });
  });

  it('sends the Afghan deed, and a godam', async () => {
    post.mockResolvedValue({ id: 'p4' });
    mount();
    fireEvent.click(screen.getByRole('combobox', { name: rx('filter.type') }));
    fireEvent.click(screen.getByRole('option', { name: 'گدام' }));
    fireEvent.click(screen.getByRole('radio', { name: 'فروشی' }));
    fireEvent.change(screen.getByRole('textbox', { name: start('import.field.price') }), { target: { value: '90000' } });
    fireEvent.change(screen.getByRole('textbox', { name: start('form.areaLabel') }), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('combobox', { name: rx('form.deed') }));
    fireEvent.click(screen.getByRole('option', { name: 'قباله شرعی' }));
    fireEvent.click(screen.getByRole('combobox', { name: rx('import.field.province') }));
    fireEvent.click(screen.getByRole('option', { name: 'کابل' }));
    fireEvent.change(screen.getByRole('combobox', { name: start('import.field.address') }), { target: { value: 'خیرخانه' } });
    fireEvent.change(screen.getByRole('textbox', { name: start('import.field.title') }), { target: { value: 'گدام در کابل' } });
    fireEvent.click(screen.getByRole('radio', { name: 'دالر' }));
    fireEvent.click(screen.getByRole('button', { name: t('form.saveNext') }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).toMatchObject({ market: 'AF', type: 'WAREHOUSE', deed_type: 'SHARI', currency: 'USD' });
    expect(post.mock.calls[0]![1]).not.toHaveProperty('features');
  });
});

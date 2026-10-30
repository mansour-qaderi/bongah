// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const patch = vi.fn();
const mutateMe = vi.fn(async () => undefined);
let me: Record<string, unknown> | undefined;
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('swr', () => ({ mutate: vi.fn(async () => undefined), default: vi.fn() }));
vi.mock('@/hooks/use-api', () => ({
  useWallet: () => ({ data: undefined }),
  useMe: () => ({ data: me, mutate: mutateMe }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: { patch: (...a: unknown[]) => patch(...a) },
}));
vi.mock('@/lib/listing-actions', () => ({ refreshListingData: vi.fn(async () => undefined) }));
vi.mock('@/lib/import/publish', () => ({ publishDrafts: vi.fn(async () => []) }));

import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { TooltipProvider } from '@/components/ui/tooltip';
import fs from 'node:fs';
import path from 'node:path';
import { prs } from '@/i18n/messages/prs';
import { DraftGrid } from '@/components/quick-add/draft-grid';
import { useDrafts } from '@/lib/import/drafts-store';
import { emptyDraft, type DraftRow } from '@/lib/import/types';
import { setActiveMarket } from '@/lib/market';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('prs', key, vars);

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('bongah.drafts-view', JSON.stringify('table'));
  setActiveMarket('AF');
  patch.mockReset();
  mutateMe.mockClear();
  me = { id: 'u1', phone_number: '+93700000001', market: 'AF' };
});
afterEach(() => cleanup());

describe('the country is never a setting', () => {
  it('has no country switcher in the account menu or anywhere else (it is found from the browser)', () => {
    const root = path.resolve(__dirname, '..');
    expect(fs.existsSync(path.join(root, 'components/ui/market-switcher.tsx'))).toBe(false);
    const menu = fs.readFileSync(path.join(root, 'components/layout/account-menu.tsx'), 'utf8');
    expect(menu).not.toMatch(/MarketSwitcher|market-switcher|account-market/);
    expect(Object.keys(prs)).not.toContain('market.settings.title');
  });
});

const iranRow = (key: string, over: Partial<DraftRow> = {}): DraftRow => ({
  ...emptyDraft('form'),
  key,
  market: 'IR',
  title: 'ویلا در نوشهر برای اجاره روزانه',
  type: 'VILLA_GARDEN',
  deal_type: 'DAILY_RENT',
  price: '3000000',
  currency: 'TOMAN',
  area_sqm: '400',
  province: 'مازندران',
  address: 'نوشهر، خیابان ساحلی',
  ...over,
});

let seed: DraftRow[] = [];
function Seed() {
  const { actions } = useDrafts();
  return (
    <button
      onClick={() => {
        actions.clear();
        actions.add(seed);
      }}
    >
      seed
    </button>
  );
}
function mountGrid(rows: DraftRow[]) {
  seed = rows;
  render(
    <LanguageProvider initialLanguage="prs">
      <TooltipProvider>
        <Seed />
        <DraftGrid />
      </TooltipProvider>
    </LanguageProvider>,
  );
  fireEvent.click(screen.getByText('seed'));
}

/** Opens a select and reads the names of its options (then closes it again). */
function optionsOf(trigger: HTMLElement): string[] {
  fireEvent.click(trigger);
  const names = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent ?? '');
  fireEvent.keyDown(trigger, { key: 'Escape' });
  return names;
}
const fieldSelect = (row: HTMLElement, field: Parameters<typeof translate>[1]) =>
  within(row).getByRole('combobox', { name: new RegExp(t(field)) });

describe('the tags, deed and monthly rent of a draft row', () => {
  it('opens the monthly rent for a mortgage-and-rent only, and offers each market its own tags or deed', async () => {
    mountGrid([
      iranRow('a', { type: 'APARTMENT', deal_type: 'MORTGAGE_RENT', price: '200000000', monthly_rent: '8000000', features: ['ELEVATOR'] }),
      iranRow('b', { type: 'APARTMENT', deal_type: 'SALE', price: '9000000000' }),
      iranRow('c', { market: 'AF', deal_type: 'SALE', currency: 'AFGHANI', type: 'WAREHOUSE', province: 'کابل', deed_type: 'ORFI' }),
    ]);
    const rows = (await screen.findAllByRole('row')).filter((r) => r.querySelector('[role="combobox"]')) as HTMLElement[];
    expect(rows).toHaveLength(3);
    const [rent, sale, afghan] = rows as [HTMLElement, HTMLElement, HTMLElement];
    const rentBox = (row: HTMLElement) => within(row).getByRole('textbox', { name: new RegExp(t('import.field.monthly_rent')) }) as HTMLInputElement;
    expect(rentBox(rent).disabled).toBe(false);
    expect(rentBox(rent).value).toBe('8000000');
    expect(rentBox(sale).disabled).toBe(true);
    // Iran: a tag menu that says what is ticked; no deed. Afghanistan: a deed; no tags.
    expect(within(rent).getByRole('button', { name: new RegExp(t('import.field.features')) }).textContent).toContain('آسانسور');
    expect(within(rent).queryByRole('combobox', { name: new RegExp(t('import.field.deed_type')) })).toBeNull();
    expect(within(afghan).queryByRole('button', { name: new RegExp(t('import.field.features')) })).toBeNull();
    expect(fieldSelect(afghan, 'import.field.deed_type').textContent).toBe('عرفی');
    expect(optionsOf(fieldSelect(afghan, 'import.field.deed_type'))).toEqual(expect.arrayContaining(['قباله شرعی', 'عرفی']));
  });

  it('empties the monthly rent when the row’s deal is changed', async () => {
    mountGrid([iranRow('a', { type: 'APARTMENT', deal_type: 'MORTGAGE_RENT', price: '200000000', monthly_rent: '8000000' })]);
    const row = (await screen.findAllByRole('row')).find((r) => r.querySelector('[role="combobox"]')) as HTMLElement;
    fireEvent.click(fieldSelect(row, 'import.field.deal_type'));
    fireEvent.click(screen.getByRole('option', { name: 'فروش' }));
    await waitFor(() => {
      const after = screen.getAllByRole('row').find((r) => r.querySelector('[role="combobox"]')) as HTMLElement;
      const box = within(after).getByRole('textbox', { name: new RegExp(t('import.field.monthly_rent')) }) as HTMLInputElement;
      expect(box.disabled).toBe(true);
      expect(box.value).toBe('');
    });
  });
});

describe('a draft row of each market', () => {
  it("offers an Iranian row Iran's currencies, deals, kinds and provinces — and an Afghan one Afghanistan's", async () => {
    mountGrid([iranRow('a'), iranRow('b', { market: 'AF', deal_type: 'SALE', currency: 'AFGHANI', type: 'HOUSE_HAWILI', province: 'کابل' })]);
    const rows = (await screen.findAllByRole('row')).filter((r) => r.querySelector('[role="combobox"]'));
    expect(rows).toHaveLength(2);
    const [ir, af] = rows as [HTMLElement, HTMLElement];

    const irCurrency = optionsOf(fieldSelect(ir, 'import.field.currency'));
    expect(irCurrency.filter((o) => o && o !== '—')).toEqual(['تومان']); // toman only: no rial, no dollar
    expect(irCurrency).not.toContain('افغانی');
    const irDeals = optionsOf(fieldSelect(ir, 'import.field.deal_type'));
    expect(irDeals).toEqual(expect.arrayContaining(['فروش', 'اجاره', 'رهن کامل', 'اجاره روزانه']));
    expect(irDeals).not.toContain('کرایی'); // a plain rent is Afghan
    // It is a daily rental, so only «باغ و ویلا» can be chosen as the kind of property.
    const irTypes = optionsOf(fieldSelect(ir, 'import.field.type'));
    expect(irTypes.filter((o) => o && o !== '—')).toEqual(['باغ و ویلا']);
    const irProvinces = optionsOf(fieldSelect(ir, 'import.field.province'));
    expect(irProvinces).toEqual(expect.arrayContaining(['تهران', 'گیلان']));
    expect(irProvinces).not.toContain('کابل');

    const afCurrency = optionsOf(fieldSelect(af, 'import.field.currency'));
    expect(afCurrency).toEqual(expect.arrayContaining(['افغانی', 'دالر']));
    expect(afCurrency).not.toContain('تومان');
    const afDeals = optionsOf(fieldSelect(af, 'import.field.deal_type'));
    expect(afDeals).toEqual(expect.arrayContaining(['فروشی', 'کرایی', 'گروی']));
    expect(afDeals).toContain('اجاره روزانه'); // a daily rental is offered in both countries
    expect(afDeals).not.toContain('اجاره'); // «اجاره» is Iran's deposit-and-rent
    expect(optionsOf(fieldSelect(af, 'import.field.province'))).not.toContain('تهران');
  });

  it('clears what the other country does not have when a row is switched to it', async () => {
    mountGrid([iranRow('a', { deal_type: 'RENT', type: 'DUPLEX' })]);
    const row = (await screen.findAllByRole('row')).find((r) => r.querySelector('[role="combobox"]')) as HTMLElement;
    const country = within(row).getByRole('combobox', { name: t('market.field') });
    expect(country.textContent).toBe(t('market.IR'));

    fireEvent.click(country);
    fireEvent.click(screen.getByRole('option', { name: t('market.AF') }));

    await waitFor(() => {
      const after = screen.getAllByRole('row').find((r) => r.querySelector('[role="combobox"]')) as HTMLElement;
      expect(within(after).getByRole('combobox', { name: t('market.field') }).textContent).toBe(t('market.AF'));
      expect(fieldSelect(after, 'import.field.currency').textContent).toBe('افغانی'); // tomans became afghanis
      expect(fieldSelect(after, 'import.field.type').textContent).not.toBe('دوبلکس'); // there is no duplex in Afghanistan
      expect(fieldSelect(after, 'import.field.deal_type').textContent).toBe('کرایی'); // the rent stays, in Afghan words
      expect(fieldSelect(after, 'import.field.province').textContent).not.toBe('مازندران');
    });
  });
});

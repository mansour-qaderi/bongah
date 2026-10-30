import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import i18n from 'i18next';
import { MARKET_CONFIG } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import { marketText } from '../src/i18n/market';
import { formatSolarDate } from '../src/i18n/solarHijri';
import { resetMarketForTests, setMarket } from '../src/market/marketStore';
import { KV_KEYS, kv } from '../src/storage/kv';
import FilterSheet from '../src/components/FilterSheet';
import { DealFilter, quickDeals } from '../src/screens/home/MapControls';
import { WAITING_PIN_SIZE } from '../src/screens/home/HomeScreen';
import AboutScreen from '../src/screens/about/AboutScreen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { allText, render } from '../test-utils';

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The app has no @types/node (it is a React Native project); this test only needs two Node calls.
declare const require: (name: string) => unknown;
const fs = require('fs') as { readFileSync(file: string, encoding: 'utf8'): string };
const path = require('path') as { join(...parts: string[]): string };

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const show = async (element: React.ReactElement) => {
  const tree = await render(element);
  mounted.push(tree);
  return tree;
};
const present = (root: ReactTestRenderer.ReactTestInstance, id: string) => root.findAll(n => n.props.testID === id).length > 0;

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  await kv.remove(KV_KEYS.market);
  resetMarketForTests();
  await setMarket('AF');
});
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

const t = i18n.t.bind(i18n);

/** Words an Iranian does not use: Afghan terms for places and property, and the names of Afghanistan, Dari and Pashto. */
const AFGHAN = ['دکان', 'دهلیز', 'ولایت', 'ولسوالی', 'افغان', 'کابل', 'هرات', 'کارته', 'حویلی', 'سرک', 'مارکیت', 'جریب', 'پشتو', 'پښتو', 'کرایه', 'کرایی', 'جورآمد', 'گروی', 'رهنمای'];

type Tree = { [key: string]: Tree | string };
const leaves = (node: Tree, prefix = ''): Array<[string, string]> =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  );
const isIranian = (key: string) => /IR(\.|$)/.test(key);

describe('the map screen', () => {
  it('waits with a small pin, not the big one', () => {
    expect(WAITING_PIN_SIZE).toBeLessThanOrEqual(48);
    expect(WAITING_PIN_SIZE).toBeGreaterThan(0);
  });

  it('has no daily rental among the quick filters, in either country, and the others stay', async () => {
    for (const market of ['AF', 'IR'] as const) {
      expect(quickDeals(market)).not.toContain('DAILY_RENT');
      expect(quickDeals(market)).toEqual(MARKET_CONFIG[market].dealTypes.filter(deal => deal !== 'DAILY_RENT'));
      await setMarket(market);
      const tree = await show(<DealFilter value={undefined} onChange={() => undefined} />);
      expect(present(tree.root, 'deal-DAILY_RENT')).toBe(false);
      for (const deal of quickDeals(market)) expect(present(tree.root, `deal-${deal}`)).toBe(true);
    }
  });
});

describe('the price filter', () => {
  it('has no currency pill and no unit in the boxes in Iran, where there is only the toman', async () => {
    await setMarket('IR');
    const tree = await show(<FilterSheet visible value={{}} onApply={() => undefined} onClose={() => undefined} />);
    expect(present(tree.root, 'filter-currency')).toBe(false);
    expect(allText(tree.root)).not.toContain(prs.currency.TOMAN);
  });

  it('keeps the currency choice in Afghanistan, which has two', async () => {
    const tree = await show(<FilterSheet visible value={{}} onApply={() => undefined} onClose={() => undefined} />);
    expect(present(tree.root, 'filter-currency')).toBe(true);
  });
});

describe('the words of the country', () => {
  it('uses the Iranian text in Iran when there is one, the shared text otherwise', () => {
    expect(marketText(t, 'add.descriptionPlaceholder', 'IR')).toBe(prs.add.descriptionPlaceholderIR);
    expect(marketText(t, 'add.descriptionPlaceholder', 'AF')).toBe(prs.add.descriptionPlaceholder);
    expect(marketText(t, 'add.titleExamples.SHOP', 'IR')).toBe(prs.add.titleExamples.SHOP); // no Iranian sibling: the shared one
    expect(marketText(t, 'add.titleExamples.COMMERCIAL', 'IR')).toBe(prs.add.titleExamplesIR.COMMERCIAL);
    expect(marketText(t, 'about.mission', undefined)).toBe(prs.about.mission);
  });

  it('has no Afghan word in any Iranian text, in either language, and the same Iranian keys in both', () => {
    for (const [name, locale] of [['prs', prs], ['ps', ps]] as const) {
      const offenders = leaves(locale as Tree)
        .filter(([key]) => isIranian(key))
        .flatMap(([key, value]) => AFGHAN.filter(word => value.includes(word)).map(word => `${name}: ${key} says «${word}»`));
      expect(offenders).toEqual([]);
    }
    const keys = (locale: Tree) => leaves(locale).map(([k]) => k).filter(isIranian).sort();
    expect(keys(ps as Tree)).toEqual(keys(prs as Tree));
  });

  it('names the Iranian places and rooms the Iranian way', () => {
    expect(prs.add.titleExamplesIR.COMMERCIAL).toContain('مغازه');
    expect(prs.add.descriptionPlaceholderIR).toContain('پذیرایی');
    expect(prs.add.locationHintIR).toContain('مغازه');
    expect(prs.add.descriptionPlaceholderIR).not.toContain('دهلیز');
  });

  it('writes a date with the Iranian month names in Iran and the Afghan ones in Afghanistan', () => {
    const iso = '2026-03-21T06:00:00Z'; // 1 Farvardin / Hamal 1405
    expect(formatSolarDate(iso, t, { market: 'IR', year: 'always' })).toContain('فروردین');
    expect(formatSolarDate(iso, t, { market: 'AF', year: 'always' })).toContain('حمل');
  });
});

describe('the About screen', () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const about = () => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AboutScreen {...({ navigation, route: {} } as unknown as React.ComponentProps<typeof AboutScreen>)} />
    </QueryClientProvider>
  );

  it('speaks of Afghanistan, Dari and Pashto in Afghanistan', async () => {
    const text = allText((await show(about())).root);
    expect(text).toContain(prs.about.mission);
    expect(text).toContain(prs.about.languagesValue);
  });

  it('speaks of neither in Iran, and shows Persian text instead', async () => {
    await setMarket('IR');
    const text = allText((await show(about())).root);
    expect(text).toContain(prs.about.missionIR);
    expect(text).toContain(prs.about.languagesValueIR);
    expect(['افغان', 'دری', 'پښتو', 'پشتو'].filter(word => text.includes(word))).toEqual([]);
  });
});

describe('the country is never a setting', () => {
  it('has no «بازار و کشور» row in the account screen, and nothing in the app reads or writes a manual pin', () => {
    const root = path.join(__dirname, '..', 'src');
    const account = fs.readFileSync(path.join(root, 'screens/account/AccountScreen.tsx'), 'utf8');
    expect(account).not.toContain('market-setting');
    expect(account).not.toContain('market.settingsTitle');
    for (const locale of [prs, ps]) {
      expect(Object.keys(locale.market)).not.toContain('settingsTitle');
      expect(Object.keys(locale.market)).not.toContain('switched');
    }
    const store = fs.readFileSync(path.join(root, 'market/marketStore.ts'), 'utf8');
    expect(store).not.toMatch(/isMarketManual/);
  });
});

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { KV_KEYS, kv } from '../src/storage/kv';
import {
  getMarket,
  isMarketKnown,
  resetMarketForTests,
  setMarket,
  useActiveMarket,
} from '../src/market/marketStore';
import { detectMarket } from '../src/market/detect';
import { useMarketSync } from '../src/market/useMarket';
import { render } from '../test-utils';

const mockLocate = jest.fn();
jest.mock('../src/map/location', () => ({
  ...jest.requireActual('../src/map/location'),
  locate: (...args: unknown[]) => mockLocate(...args),
}));
const mockUpdatePreferences = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  ...jest.requireActual('../src/api/endpoints'),
  updatePreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
}));
let mockUser: { market: 'AF' | 'IR' } | null = null;
const mockUpdateUser = jest.fn();
jest.mock('../src/auth/AuthContext', () => ({
  ...jest.requireActual('../src/auth/AuthContext'),
  useAuth: () => ({ user: mockUser, status: mockUser ? 'signedIn' : 'signedOut', updateUser: mockUpdateUser }),
}));

const fix = (latitude: number, longitude: number) => ({
  status: 'ok' as const,
  coordinate: { latitude, longitude },
});
const KABUL = fix(34.53, 69.17);
const TEHRAN = fix(35.69, 51.39);

function Probe() {
  useMarketSync();
  return <Text testID="market">{useActiveMarket()}</Text>;
}
const shown = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findByProps({ testID: 'market' }).props.children;
const settle = () =>
  ReactTestRenderer.act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });
const unmount = (tree: ReactTestRenderer.ReactTestRenderer) =>
  ReactTestRenderer.act(async () => {
    tree.unmount();
  });

beforeEach(async () => {
  for (const key of [KV_KEYS.market, KV_KEYS.marketManual, KV_KEYS.marketAsked]) await kv.remove(key);
  resetMarketForTests('IR');
  mockUser = null;
  mockLocate.mockReset();
  mockUpdatePreferences.mockReset();
  mockUpdatePreferences.mockImplementation(async (body: { market: 'AF' | 'IR' }) => ({ market: body.market }));
  mockUpdateUser.mockReset();
});

describe('the market on the phone', () => {
  it('remembers a choice across restarts and follows a change in every screen at once', async () => {
    await kv.set(KV_KEYS.market, 'AF');
    const first = await render(<Probe />);
    const second = await render(<Probe />);
    mockLocate.mockResolvedValue({ status: 'denied' });
    await settle();
    expect(shown(first)).toBe('AF');
    expect(shown(second)).toBe('AF');
    await ReactTestRenderer.act(async () => {
      await setMarket('IR');
    });
    expect(shown(first)).toBe('IR');
    expect(shown(second)).toBe('IR');
    expect(await kv.get(KV_KEYS.market)).toBe('IR');
    expect(getMarket()).toBe('IR');
    await unmount(first);
    await unmount(second);
  });

  it('ignores a damaged saved value', async () => {
    await kv.set(KV_KEYS.market, 'TR');
    mockLocate.mockResolvedValue({ status: 'denied' });
    const tree = await render(<Probe />);
    await settle();
    expect(shown(tree)).toBe('IR'); // nothing usable was saved: Iran
    await unmount(tree);
  });

  it('remembers a country found from the position, and a later one replaces it (nobody pins a country)', async () => {
    await ReactTestRenderer.act(async () => {
      await setMarket('AF');
    });
    expect(isMarketKnown()).toBe(true);
    expect(await kv.get(KV_KEYS.market)).toBe('AF');
    await ReactTestRenderer.act(async () => {
      await setMarket('IR');
    });
    expect(getMarket()).toBe('IR');
    expect(await kv.get(KV_KEYS.market)).toBe('IR');
    expect(await kv.get(KV_KEYS.marketManual)).toBeNull();
  });
});

describe('the country from the phone’s position', () => {
  it('is Afghanistan in Kabul and Iran in Tehran', async () => {
    mockLocate.mockResolvedValue(KABUL);
    expect(await detectMarket()).toBe('AF');
    mockLocate.mockResolvedValue(TEHRAN);
    expect(await detectMarket()).toBe('IR');
  });

  it('cannot tell when the position is refused, missing or elsewhere', async () => {
    mockLocate.mockResolvedValue({ status: 'denied' });
    expect(await detectMarket()).toBeNull();
    mockLocate.mockResolvedValue(fix(48.85, 2.35)); // Paris
    expect(await detectMarket()).toBeNull();
    mockLocate.mockRejectedValue(new Error('boom'));
    expect(await detectMarket()).toBeNull();
  });

  it('shows the location prompt once, then only uses a permission already given', async () => {
    mockLocate.mockResolvedValue({ status: 'denied' });
    await detectMarket();
    await detectMarket();
    expect(mockLocate.mock.calls.map(call => call[0])).toEqual([{ ask: true }, { ask: false }]);
  });
});

describe('finding the country at start', () => {
  it('opens in Iran when location is off and nothing is known', async () => {
    mockLocate.mockResolvedValue({ status: 'denied' });
    const tree = await render(<Probe />);
    await settle();
    expect(shown(tree)).toBe('IR');
    expect(await kv.get(KV_KEYS.market)).toBe('IR');
    await unmount(tree);
  });

  it('takes the country the phone is in', async () => {
    mockLocate.mockResolvedValue(KABUL);
    const tree = await render(<Probe />);
    await settle();
    expect(shown(tree)).toBe('AF');
    await unmount(tree);
  });

  it('keeps the last country when the position is unavailable later', async () => {
    await kv.set(KV_KEYS.market, 'AF');
    mockLocate.mockResolvedValue({ status: 'denied' });
    const tree = await render(<Probe />);
    await settle();
    expect(shown(tree)).toBe('AF');
    await unmount(tree);
  });

  it('drops the «chosen by hand» pin that older versions left, so the position decides again', async () => {
    // Settings used to let the person pick a country and kept it for good. That setting is gone: such a pin would
    // hold the app in a country with no way left to change it.
    await kv.set(KV_KEYS.market, 'AF');
    await kv.set(KV_KEYS.marketManual, '1');
    mockLocate.mockResolvedValue(TEHRAN);
    const tree = await render(<Probe />);
    await settle();
    expect(shown(tree)).toBe('IR');
    expect(mockLocate).toHaveBeenCalled();
    expect(await kv.get(KV_KEYS.marketManual)).toBeNull();
    await unmount(tree);
  });

  it('signed in, tells the account quietly which country the phone is in', async () => {
    mockUser = { market: 'AF' };
    mockLocate.mockResolvedValue(TEHRAN);
    const tree = await render(<Probe />);
    await settle();
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ market: 'IR' });
    expect(mockUpdateUser).toHaveBeenCalled();
    await unmount(tree);
  });

  it('signed in, does not take the account’s country over the phone’s: the account is what follows', async () => {
    await kv.set(KV_KEYS.market, 'IR');
    mockUser = { market: 'AF' };
    mockLocate.mockResolvedValue({ status: 'denied' });
    const tree = await render(<Probe />);
    await settle();
    expect(shown(tree)).toBe('IR');
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ market: 'IR' });
    await unmount(tree);
  });
});

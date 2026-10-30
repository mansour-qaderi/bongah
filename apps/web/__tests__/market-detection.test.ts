// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Geo = { getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void, fail: () => void) => void };

function stubGeo(geo: Geo | undefined, permission: PermissionState | 'none' = 'prompt') {
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  Object.defineProperty(navigator, 'permissions', {
    value: permission === 'none' ? undefined : { query: vi.fn(async () => ({ state: permission })) },
    configurable: true,
  });
}
const at = (latitude: number, longitude: number): Geo => ({ getCurrentPosition: (ok) => ok({ coords: { latitude, longitude } }) });
const refused: Geo = { getCurrentPosition: (_ok, fail) => fail() };

/** The module keeps "settled" for the page's life, so every test loads a fresh copy. */
async function fresh() {
  vi.resetModules();
  return import('@/lib/market');
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('finding the country from the browser’s position', () => {
  it('is Afghanistan in Kabul and Iran in Tehran', async () => {
    stubGeo(at(34.53, 69.17));
    expect(await (await fresh()).detectBrowserMarket()).toBe('AF');
    window.localStorage.clear();
    stubGeo(at(35.69, 51.39));
    expect(await (await fresh()).detectBrowserMarket()).toBe('IR');
  });

  it('cannot tell when the position is refused, missing, or in neither country', async () => {
    stubGeo(refused);
    expect(await (await fresh()).detectBrowserMarket()).toBeNull();
    window.localStorage.clear();
    stubGeo(undefined);
    expect(await (await fresh()).detectBrowserMarket()).toBeNull();
    window.localStorage.clear();
    stubGeo(at(48.85, 2.35));
    expect(await (await fresh()).detectBrowserMarket()).toBeNull();
  });

  it('does not ask again once the permission was denied or the prompt was already shown', async () => {
    const spy = vi.fn();
    stubGeo({ getCurrentPosition: spy }, 'denied');
    expect(await (await fresh()).detectBrowserMarket()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    stubGeo({ getCurrentPosition: spy }, 'prompt');
    window.localStorage.setItem('bongah.market.asked', '1');
    expect(await (await fresh()).detectBrowserMarket()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('settling the market', () => {
  it('falls back to Iran on a first visit when the position is unavailable', async () => {
    stubGeo(refused);
    const m = await fresh();
    await m.settleMarket();
    expect(m.activeMarket()).toBe('IR');
    expect(m.marketSettled()).toBe(true);
  });

  it('takes the country the browser is in', async () => {
    stubGeo(at(34.53, 69.17));
    const m = await fresh();
    await m.settleMarket();
    expect(m.activeMarket()).toBe('AF');
  });

  it('keeps the last known country when the position is unavailable later', async () => {
    window.localStorage.setItem('bongah.market', 'AF');
    stubGeo(refused);
    const m = await fresh();
    await m.settleMarket();
    expect(m.activeMarket()).toBe('AF');
  });

  it('drops the «chosen by hand» pin that older versions left, so the position decides again', async () => {
    window.localStorage.setItem('bongah.market', 'AF');
    window.localStorage.setItem('bongah.market.manual', '1');
    stubGeo(at(35.69, 51.39));
    const m = await fresh();
    await m.settleMarket();
    expect(m.activeMarket()).toBe('IR');
    expect(window.localStorage.getItem('bongah.market.manual')).toBeNull();
  });
});

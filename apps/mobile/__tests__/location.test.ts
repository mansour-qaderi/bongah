import { PermissionsAndroid, Platform } from 'react-native';
import { LocationManager } from '@maplibre/maplibre-react-native';
import { LOCATE_TIMEOUT_MS, locate } from '../src/map/location';

type Stub = {
  grant: boolean;
  position: unknown;
  requests: number;
  fixes: number;
};
const stub = (): Stub =>
  (
    jest.requireMock('@maplibre/maplibre-react-native') as {
      __location: Stub;
    }
  ).__location;

const fix = (latitude: number, longitude: number) => ({
  coords: {
    latitude,
    longitude,
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1,
});
const KABUL = fix(34.5281, 69.1723);

beforeEach(() => {
  Object.assign(stub(), {
    grant: true,
    position: undefined,
    requests: 0,
    fixes: 0,
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const asAndroid = (allowed: boolean) => {
  jest.replaceProperty(Platform, 'OS', 'android');
  return jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(allowed);
};

describe('locate on iOS', () => {
  it('quietly uses the position when there is one, and never asks', async () => {
    stub().position = KABUL;
    expect(await locate({ ask: false })).toEqual({
      status: 'ok',
      coordinate: { latitude: 34.5281, longitude: 69.1723 },
    });
    expect(stub().requests).toBe(0);
  });

  it('quietly gives up, without a prompt, when there is no position (never allowed)', async () => {
    expect(await locate({ ask: false })).toEqual({ status: 'denied' });
    expect(stub().requests).toBe(0);
  });

  it('asks when told to, and reads the position once allowed', async () => {
    stub().position = KABUL;
    expect((await locate({ ask: true })).status).toBe('ok');
    expect(stub().requests).toBe(1);
  });

  it('is denied, and does not even look for a position, when the prompt is refused', async () => {
    stub().grant = false;
    stub().position = KABUL;
    expect(await locate({ ask: true })).toEqual({ status: 'denied' });
    expect(stub().fixes).toBe(0);
  });

  it('says "unavailable" (not denied) when allowed but there is no fix', async () => {
    expect(await locate({ ask: true })).toEqual({ status: 'unavailable' });
  });
});

describe('locate on Android', () => {
  it('quietly does nothing, and does not prompt, when location was never allowed', async () => {
    const check = asAndroid(false);
    stub().position = KABUL;
    expect(await locate({ ask: false })).toEqual({ status: 'denied' });
    expect(check).toHaveBeenCalled();
    expect(stub().requests).toBe(0);
    expect(stub().fixes).toBe(0);
  });

  it('uses the position quietly when location is already allowed', async () => {
    asAndroid(true);
    stub().position = KABUL;
    expect((await locate({ ask: false })).status).toBe('ok');
    expect(stub().requests).toBe(0);
  });

  it('prompts only when asked and not yet allowed', async () => {
    asAndroid(false);
    stub().position = KABUL;
    expect((await locate({ ask: true })).status).toBe('ok');
    expect(stub().requests).toBe(1);
  });

  it('does not prompt again when asked but already allowed', async () => {
    asAndroid(true);
    stub().position = KABUL;
    await locate({ ask: true });
    expect(stub().requests).toBe(0);
  });

  it('counts coarse location as allowed too', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest
      .spyOn(PermissionsAndroid, 'check')
      .mockImplementation(
        async permission =>
          permission === PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      );
    stub().position = KABUL;
    expect((await locate({ ask: false })).status).toBe('ok');
  });
});

describe('locate: the position itself', () => {
  it('says "outside" for a fix that is not in Afghanistan, so the map stays put', async () => {
    stub().position = fix(51.5, -0.12); // London
    expect(await locate({ ask: true })).toEqual({ status: 'outside' });
  });

  it('accepts a fix right at the edge of the country box', async () => {
    stub().position = fix(29.4, 60.5);
    expect((await locate({ ask: true })).status).toBe('ok');
  });

  it('refuses a fix with unreadable numbers', async () => {
    stub().position = fix(NaN, 69);
    expect(await locate({ ask: true })).toEqual({ status: 'unavailable' });
  });

  it('never throws, even when the native module does', async () => {
    jest
      .spyOn(LocationManager, 'getCurrentPosition')
      .mockRejectedValue(new Error('native crash'));
    expect(await locate({ ask: true })).toEqual({ status: 'unavailable' });
  });

  it('gives up after the timeout when no fix ever arrives', async () => {
    jest.useFakeTimers();
    jest
      .spyOn(LocationManager, 'getCurrentPosition')
      .mockReturnValue(new Promise(() => undefined));
    const result = locate({ ask: true });
    await jest.advanceTimersByTimeAsync(LOCATE_TIMEOUT_MS + 1);
    expect(await result).toEqual({ status: 'unavailable' });
  });
});

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { PROVINCES } from '../src/constants/provinces';
import { AREA_MIN_ZOOM, areaKey, areaLabel, type AreaGuess } from '../src/map/areaName';
import {
  MIN_GAP_MS,
  resetAreaNames,
  SETTLE_MS,
  useAreaName,
  type AreaView,
} from '../src/map/useAreaName';

const mockDescribe = jest.fn();
jest.mock('../src/map/GeocodingService', () => ({
  describeSpot: (...args: unknown[]) => mockDescribe(...args),
}));

const KABUL = { latitude: 34.5281, longitude: 69.1761 };
const kabul = PROVINCES.find(p => p.id === 'kabul')!;
const guess = (over: Partial<AreaGuess> = {}): AreaGuess => ({
  province: kabul,
  district: 'ناحیه ۴',
  neighborhood: 'وزیر اکبرخان',
  answered: true,
  ...over,
});

describe('areaLabel / areaKey', () => {
  it('joins neighbourhood, district and province', () => {
    expect(areaLabel(guess(), KABUL, 'prs')).toBe('وزیر اکبرخان، ناحیه ۴، کابل');
  });
  it('is the province alone when nothing could describe the spot', () => {
    expect(areaLabel(guess({ answered: false, district: '', neighborhood: '' }), KABUL, 'prs')).toBe('کابل');
    expect(areaLabel(null, KABUL, 'ps')).toBe('کابل');
    expect(areaLabel(guess({ district: '', neighborhood: '' }), KABUL, 'prs')).toBe('کابل');
  });
  it('uses the nearest province when the geocoder named none, and the Pashto spelling in Pashto', () => {
    const kandahar = PROVINCES.find(p => p.id === 'kandahar')!;
    expect(areaLabel(guess({ province: null, district: '', neighborhood: '' }), { latitude: 31.62, longitude: 65.71 }, 'ps')).toBe(
      kandahar.name.ps,
    );
  });
  it('does not say a name twice', () => {
    expect(areaLabel(guess({ district: 'کابل', neighborhood: 'کابل' }), KABUL, 'prs')).toBe('کابل');
  });
  it('keys one neighbourhood to one slot, and splits by language', () => {
    expect(areaKey(KABUL, 'prs')).toBe(areaKey({ latitude: 34.5339, longitude: 69.178 }, 'prs'));
    expect(areaKey(KABUL, 'prs')).not.toBe(areaKey(KABUL, 'ps'));
  });
});

describe('useAreaName', () => {
  let latest: string | null = null;
  const Probe = ({ view, language = 'prs' }: { view: AreaView | null; language?: 'prs' | 'ps' }) => {
    latest = useAreaName(view, language);
    return null;
  };
  const mount = (view: AreaView | null, language: 'prs' | 'ps' = 'prs') => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<Probe view={view} language={language} />);
    });
    return tree;
  };
  const rerender = (tree: ReactTestRenderer.ReactTestRenderer, view: AreaView | null, language: 'prs' | 'ps' = 'prs') =>
    ReactTestRenderer.act(() => tree.update(<Probe view={view} language={language} />));
  const advance = async (ms: number) =>
    ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(ms);
    });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    mockDescribe.mockReset();
    resetAreaNames();
    latest = null;
  });
  afterEach(() => jest.useRealTimers());

  it('is the nearest province with no lookup while zoomed out', async () => {
    mount({ center: KABUL, zoom: AREA_MIN_ZOOM - 1 });
    expect(latest).toBe('کابل');
    await advance(5_000);
    expect(mockDescribe).not.toHaveBeenCalled();
  });

  it('is nothing outside Afghanistan', () => {
    mount({ center: { latitude: 48.85, longitude: 2.35 }, zoom: 15 });
    expect(latest).toBeNull();
  });

  it('asks once the map has rested, then shows the neighbourhood, district and province', async () => {
    mockDescribe.mockResolvedValue(guess());
    mount({ center: KABUL, zoom: 15 });
    expect(latest).toBeNull();
    await advance(SETTLE_MS - 1);
    expect(mockDescribe).not.toHaveBeenCalled();
    await advance(2);
    expect(mockDescribe).toHaveBeenCalledTimes(1);
    expect(mockDescribe.mock.calls[0][0]).toEqual(KABUL);
    expect(mockDescribe.mock.calls[0][1]).toMatchObject({ language: 'prs' });
    expect(latest).toBe('وزیر اکبرخان، ناحیه ۴، کابل');
  });

  it('does not ask while the map is still moving (each move restarts the wait)', async () => {
    mockDescribe.mockResolvedValue(guess());
    const tree = mount({ center: KABUL, zoom: 15 });
    for (let i = 1; i <= 5; i += 1) {
      await advance(SETTLE_MS - 100);
      rerender(tree, { center: { latitude: KABUL.latitude + i * 0.05, longitude: KABUL.longitude }, zoom: 15 });
    }
    expect(mockDescribe).not.toHaveBeenCalled();
    await advance(SETTLE_MS + 10);
    expect(mockDescribe).toHaveBeenCalledTimes(1);
  });

  it('remembers a neighbourhood: coming back to it asks nothing', async () => {
    mockDescribe.mockResolvedValue(guess());
    const tree = mount({ center: KABUL, zoom: 15 });
    await advance(SETTLE_MS + 10);
    rerender(tree, { center: { latitude: 36.7, longitude: 67.1 }, zoom: 15 });
    await advance(MIN_GAP_MS + SETTLE_MS + 10); // the Balkh lookup answers with the same mock
    const asked = mockDescribe.mock.calls.length;
    rerender(tree, { center: KABUL, zoom: 15 });
    expect(latest).toBe('وزیر اکبرخان، ناحیه ۴، کابل');
    await advance(5_000);
    expect(mockDescribe.mock.calls.length).toBe(asked);
  });

  it('keeps the old name while the new one is on its way, and drops a late answer for a place left behind', async () => {
    let release!: (g: AreaGuess) => void;
    mockDescribe
      .mockResolvedValueOnce(guess())
      .mockImplementationOnce(() => new Promise<AreaGuess>(r => (release = r)))
      .mockResolvedValueOnce(guess({ neighborhood: 'کارته چهار', district: 'ناحیه ۳' }));
    const tree = mount({ center: KABUL, zoom: 15 });
    await advance(SETTLE_MS + 10);
    expect(latest).toBe('وزیر اکبرخان، ناحیه ۴، کابل');

    const second = { center: { latitude: 34.48, longitude: 69.12 }, zoom: 15 };
    rerender(tree, second);
    await advance(MIN_GAP_MS + SETTLE_MS);
    expect(latest).toBe('وزیر اکبرخان، ناحیه ۴، کابل'); // no flicker while it is pending

    const third = { center: { latitude: 34.43, longitude: 69.05 }, zoom: 15 };
    rerender(tree, third);
    await ReactTestRenderer.act(async () => release(guess({ neighborhood: 'باغ بالا' })));
    expect(latest).not.toContain('باغ بالا'); // answered for a spot the map has left
    await advance(MIN_GAP_MS + SETTLE_MS);
    expect(latest).toBe('کارته چهار، ناحیه ۳، کابل');
  });

  it('keeps at least MIN_GAP_MS between two questions, however fast the map is moved', async () => {
    mockDescribe.mockResolvedValue(guess());
    const tree = mount({ center: KABUL, zoom: 15 });
    await advance(SETTLE_MS + 10);
    rerender(tree, { center: { latitude: 36.7, longitude: 67.1 }, zoom: 15 });
    await advance(SETTLE_MS + 10);
    expect(mockDescribe).toHaveBeenCalledTimes(1); // too soon after the first
    await advance(MIN_GAP_MS);
    expect(mockDescribe).toHaveBeenCalledTimes(2);
  });

  it('shows the province when the lookup fails', async () => {
    mockDescribe.mockRejectedValue(new Error('offline'));
    mount({ center: KABUL, zoom: 15 });
    await advance(SETTLE_MS + 10);
    expect(latest).toBe('کابل');
  });
});
